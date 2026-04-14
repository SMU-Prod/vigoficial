/**
 * VIGI — Orquestrador (Agente Supervisor)
 * PRD Seção 5 — Coordena todos os sub-agentes
 *
 * CICLOS (cron schedule):
 * - FULL: 06:00, 10:00, 14:00, 18:00, 22:00 (Mon-Sat)
 *   → DOU + Email Read + GESP Sync + Compliance + Fleet + Billing
 * - LIGHT: 09:00, 14:00 (Sunday)
 *   → DOU + Email Read only (no GESP heavy processing)
 * - URGENT: Triggered by email marked urgente (Regra R10)
 *   → Immediate GESP sync for specific company
 *
 * RESPONSIBILITIES:
 * - Dispatch sub-agents in correct order
 * - Track all dispatches and their results
 * - Aggregate metrics across agents
 * - Update system health
 * - Handle failures gracefully (one company failing doesn't stop others)
 */

import {
  startAgentRun,
  completeAgentRun,
  logAgentDecision,
  updateSystemHealth,
  TokenTracker,
} from "@/lib/agents/base";
import {
  OrquestradorState,
  AgentDispatch,
  SystemHealthMetrics,
  TriggerType,
} from "@/lib/agents/types";

import { createSupabaseAdmin } from "@/lib/supabase/server";
import {
  addCaptadorDOUJob,
  addCaptadorEmailJob,
  addOperacionalGESPJob,
  addOperacionalComplianceJob,
  addComunicadorAlertsJob,
  addBillingCheckJob,
} from "@/lib/queue/jobs";

// Constants
const BATCH_SIZE = 5;

// Internal dispatch types
interface DispatchRecord {
  id: string;
  orquestradorId: string;
  agentType: string;
  agentSubtype: string;
  companyId: string | null;
  status: "queued" | "running" | "completed" | "failed";
  queuedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  tokensUsed: number;
  error: string | null;
  jobId?: { id?: string };
}
const BATCH_DELAY_MS = 500; // Stagger batch starts
const DISPATCH_TIMEOUT_MS = 300000; // 5 minutes per dispatch
const URGENT_PRIORITY = "urgent";
const FULL_CYCLE_TYPE = "full";
const LIGHT_CYCLE_TYPE = "light";
const URGENT_CYCLE_TYPE = "urgent";

// FIX: IA-01 — Job polling helper to enforce dispatch timeout
async function pollJobCompletion(
  jobId: string | { id: string },
  timeoutMs: number
): Promise<{ status: "completed" | "failed"; error?: string }> {
  const jid = typeof jobId === "string" ? jobId : jobId.id;
  const pollInterval = 1000; // Check every 1 second
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const supabase = createSupabaseAdmin();
      const { data: jobData } = await supabase
        .from("agent_runs")
        .select("status")
        .eq("id", jid)
        .single();

      if (jobData) {
        if (jobData.status === "completed" || jobData.status === "failed") {
          return { status: jobData.status as "completed" | "failed" };
        }
      }
    } catch (_err) {
      // Query failed, continue polling
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  // Timeout exceeded
  return {
    status: "failed",
    error: `Dispatch timeout exceeded after ${timeoutMs}ms`
  };
}

// FIX: IA-06 — Simple concurrency limiter (pLimit-style)
function createConcurrencyLimiter(limit: number) {
  let running = 0;
  const _queue: Array<() => Promise<void>> = [];

  const run = async (fn: () => Promise<void>) => {
    while (running >= limit) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    running++;
    try {
      await fn();
    } finally {
      running--;
    }
  };

  return { run };
}

/**
 * Run the FULL cycle: all agents on all active companies
 * Called at: 06:00, 10:00, 14:00, 18:00, 22:00 (Mon-Sat)
 */
export async function runFullCycle(): Promise<OrquestradorState> {
  const orquestradorId = (await startAgentRun("orquestrador", FULL_CYCLE_TYPE)) as string;
  const state: OrquestradorState = {
    runId: orquestradorId,
    agentName: "orquestrador",
    triggerType: FULL_CYCLE_TYPE as TriggerType,
    triggerSource: "cron",
    orquestradorId,
    cycleType: FULL_CYCLE_TYPE,
    startedAt: new Date(),
    completedAt: null,
    dispatches: [],
    totalTokensUsed: 0,
    steps: [],
    errors: [],
    totalTokens: 0,
    totalCostUsd: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    metricsAggregated: {
      captadorDOU: { success: 0, failed: 0, tokensUsed: 0 },
      captadorEmail: { success: 0, failed: 0, tokensUsed: 0 },
      operacionalGESP: { success: 0, failed: 0, tokensUsed: 0 },
      operacionalCompliance: { success: 0, failed: 0, tokensUsed: 0 },
      operacionalWorkflow: { success: 0, failed: 0, tokensUsed: 0 },
      comunicadorAlerts: { success: 0, failed: 0, tokensUsed: 0 },
      comunicadorBatch: { success: 0, failed: 0, tokensUsed: 0 },
    },
    systemHealthUpdates: [],
  };

  try {
    const supabase = await createSupabaseAdmin();
    const tokenTracker = new TokenTracker();

    // Log cycle start decision
    await logAgentDecision(orquestradorId, {
      decision: "CYCLE_START",
      cycleType: FULL_CYCLE_TYPE,
      action: "Starting full orchestration cycle with all agents",
      rationale: "Scheduled full cycle execution",
    });

    // ========== PHASE 1: Global agents (once per cycle) ==========

    // 1a. Dispatch Captador DOU (reads federal gazette daily)
    const douDispatch = await dispatchCaptadorDOU(
      orquestradorId,
      tokenTracker,
      state
    );
    state.dispatches!.push(douDispatch);

    // 1b. Dispatch Billing Check (once per cycle, only at specific time)
    const currentHour = new Date().getHours();
    if (currentHour === 8) {
      const billingDispatch = await dispatchBillingCheck(
        orquestradorId,
        tokenTracker,
        state
      );
      state.dispatches!.push(billingDispatch);
    }

    // ========== PHASE 2: Per-company agents ==========

    const { data: companies, error: companiesError } = await supabase
      .from("empresas")
      .select("id, razao_social")
      .in("billing_status", ["ativo", "trial"])
      .limit(1000); // Safety limit

    if (companiesError || !companies) {
      const errMsg = `Failed to fetch companies: ${companiesError?.message || "unknown"}`;
      console.error(`[Orquestrador] ${errMsg}`);
      state.errors.push(errMsg);
      await logAgentDecision(orquestradorId, {
        decision: "COMPANY_FETCH_FAILED",
        cycleType: FULL_CYCLE_TYPE,
        action: "Abort company processing",
        rationale: errMsg,
      });
      // Continue with just global agents
    } else {

      // Process companies in parallel batches
      await processCompanyBatch(
        companies as { id: string; razao_social: string }[],
        BATCH_SIZE,
        FULL_CYCLE_TYPE,
        state.dispatches!,
        orquestradorId,
        tokenTracker,
        state
      );
    }

    // ========== PHASE 3: Aggregate and finalize ==========

    // Aggregate token usage
    const aggregatedTokens = state.dispatches!.reduce(
      (sum, d) => sum + (d.tokensUsed || 0),
      0
    );
    state.totalTokensUsed = aggregatedTokens;

    // Update system health across all components
    const healthMetrics: SystemHealthMetrics = {
      lastCycleType: FULL_CYCLE_TYPE,
      lastCycleAt: new Date(),
      totalDispatches: state.dispatches!.length,
      successfulDispatches: state.dispatches!.filter(
        (d) => d.status === "completed"
      ).length,
      failedDispatches: state.dispatches!.filter(
        (d) => d.status === "failed"
      ).length,
      totalTokensLastCycle: aggregatedTokens,
      avgTokensPerDispatch:
        aggregatedTokens / Math.max(state.dispatches!.length, 1),
    };

    await updateSystemHealth("orquestrador", healthMetrics);
    state.systemHealthUpdates!.push(healthMetrics);

    // Log cycle completion
    await logAgentDecision(orquestradorId, {
      decision: "CYCLE_COMPLETE",
      cycleType: FULL_CYCLE_TYPE,
      action: `Completed with ${state.dispatches!.length} dispatches, ${aggregatedTokens} tokens`,
      rationale: "All agents processed successfully",
    });

    state.completedAt = new Date();
    await completeAgentRun(orquestradorId, "orquestrador", "completed", {}, undefined, undefined);

    return state;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Orquestrador] Unhandled error in full cycle: ${errMsg}`);
    state.errors.push(errMsg);

    state.completedAt = new Date();
    await completeAgentRun(orquestradorId, "orquestrador", "failed", {}, undefined, errMsg);

    return state;
  }
}

/**
 * Run the LIGHT cycle: DOU + Email Read only
 * Called at: 09:00, 14:00 (Sunday)
 * No GESP sync, no compliance, no fleet, no billing
 */
export async function runLightCycle(): Promise<OrquestradorState> {
  const orquestradorId = (await startAgentRun("orquestrador", LIGHT_CYCLE_TYPE)) as string;
  const state: OrquestradorState = {
    runId: orquestradorId,
    agentName: "orquestrador",
    triggerType: LIGHT_CYCLE_TYPE as TriggerType,
    triggerSource: "cron",
    orquestradorId,
    cycleType: LIGHT_CYCLE_TYPE,
    startedAt: new Date(),
    completedAt: null,
    dispatches: [],
    totalTokensUsed: 0,
    steps: [],
    errors: [],
    totalTokens: 0,
    totalCostUsd: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    metricsAggregated: {
      captadorDOU: { success: 0, failed: 0, tokensUsed: 0 },
      captadorEmail: { success: 0, failed: 0, tokensUsed: 0 },
      operacionalGESP: { success: 0, failed: 0, tokensUsed: 0 },
      operacionalCompliance: { success: 0, failed: 0, tokensUsed: 0 },
      operacionalWorkflow: { success: 0, failed: 0, tokensUsed: 0 },
      comunicadorAlerts: { success: 0, failed: 0, tokensUsed: 0 },
      comunicadorBatch: { success: 0, failed: 0, tokensUsed: 0 },
    },
    systemHealthUpdates: [],
  };

  try {
    const supabase = await createSupabaseAdmin();
    const tokenTracker = new TokenTracker();

    // Log cycle start decision
    await logAgentDecision(orquestradorId, {
      decision: "LIGHT_CYCLE_START",
      cycleType: LIGHT_CYCLE_TYPE,
      action: "Starting light orchestration cycle (Sunday)",
      rationale:
        "Weekend reduced processing: DOU + Email only, no GESP/Compliance/Billing",
    });

    // ========== PHASE 1: Global agents ==========

    const douDispatch = await dispatchCaptadorDOU(
      orquestradorId,
      tokenTracker,
      state
    );
    state.dispatches!.push(douDispatch);

    // ========== PHASE 2: Per-company agents (Email Read only) ==========

    const { data: companies, error: companiesError } = await supabase
      .from("empresas")
      .select("id, razao_social")
      .in("billing_status", ["ativo", "trial"])
      .limit(1000);

    if (companiesError || !companies) {
      const errMsg = `Failed to fetch companies: ${companiesError?.message || "unknown"}`;
      console.error(`[Orquestrador] ${errMsg}`);
      state.errors.push(errMsg);
    } else {

      // Process companies in batches for Email Read only
      await processCompanyBatchLight(
        companies as { id: string; razao_social: string }[],
        BATCH_SIZE,
        state.dispatches!,
        orquestradorId,
        tokenTracker,
        state
      );
    }

    // ========== PHASE 3: Finalize ==========

    const aggregatedTokens = state.dispatches!.reduce(
      (sum, d) => sum + (d.tokensUsed || 0),
      0
    );
    state.totalTokensUsed = aggregatedTokens;

    const healthMetrics: SystemHealthMetrics = {
      lastCycleType: LIGHT_CYCLE_TYPE,
      lastCycleAt: new Date(),
      totalDispatches: state.dispatches!.length,
      successfulDispatches: state.dispatches!.filter(
        (d) => d.status === "completed"
      ).length,
      failedDispatches: state.dispatches!.filter(
        (d) => d.status === "failed"
      ).length,
      totalTokensLastCycle: aggregatedTokens,
      avgTokensPerDispatch:
        aggregatedTokens / Math.max(state.dispatches!.length, 1),
    };

    await updateSystemHealth("orquestrador", healthMetrics);
    state.systemHealthUpdates!.push(healthMetrics);

    await logAgentDecision(orquestradorId, {
      decision: "LIGHT_CYCLE_COMPLETE",
      cycleType: LIGHT_CYCLE_TYPE,
      action: `Completed light cycle with ${state.dispatches!.length} dispatches`,
      rationale: "Weekend processing finished",
    });

    state.completedAt = new Date();
    await completeAgentRun(orquestradorId, "orquestrador", "completed", {}, undefined, undefined);

    return state;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Orquestrador] Unhandled error in light cycle: ${errMsg}`);
    state.errors.push(errMsg);

    state.completedAt = new Date();
    await completeAgentRun(orquestradorId, "orquestrador", "failed", {}, undefined, errMsg);

    return state;
  }
}

/**
 * Run the URGENT cycle: Immediate processing for a specific company
 * Triggered by Regra R10 (email marked urgente)
 * Priority processing: GESP Sync → Compliance → Alerts
 */
export async function runUrgentCycle(
  companyId: string,
  reason: string
): Promise<OrquestradorState> {
  const orquestradorId = (await startAgentRun(
    "orquestrador",
    URGENT_CYCLE_TYPE
  )) as string;
  const state: OrquestradorState = {
    runId: orquestradorId,
    agentName: "orquestrador",
    triggerType: URGENT_CYCLE_TYPE as TriggerType,
    triggerSource: "urgent",
    orquestradorId,
    cycleType: URGENT_CYCLE_TYPE,
    startedAt: new Date(),
    completedAt: null,
    dispatches: [],
    totalTokensUsed: 0,
    steps: [],
    errors: [],
    totalTokens: 0,
    totalCostUsd: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    metricsAggregated: {
      captadorDOU: { success: 0, failed: 0, tokensUsed: 0 },
      captadorEmail: { success: 0, failed: 0, tokensUsed: 0 },
      operacionalGESP: { success: 0, failed: 0, tokensUsed: 0 },
      operacionalCompliance: { success: 0, failed: 0, tokensUsed: 0 },
      operacionalWorkflow: { success: 0, failed: 0, tokensUsed: 0 },
      comunicadorAlerts: { success: 0, failed: 0, tokensUsed: 0 },
      comunicadorBatch: { success: 0, failed: 0, tokensUsed: 0 },
    },
    systemHealthUpdates: [],
  };

  try {
    const supabase = await createSupabaseAdmin();
    const tokenTracker = new TokenTracker();

    // Log urgent cycle start
    await logAgentDecision(orquestradorId, {
      decision: "URGENT_CYCLE_START",
      cycleType: URGENT_CYCLE_TYPE,
      action: `Starting urgent cycle for company ${companyId}`,
      rationale: reason,
    });


    // Fetch company details
    const { data: company, error: companyError } = await supabase
      .from("empresas")
      .select("id, razao_social")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      const errMsg = `Company ${companyId} not found`;
      console.error(`[Orquestrador] ${errMsg}`);
      state.errors.push(errMsg);
      throw new Error(errMsg);
    }

    // ========== URGENT PROCESSING: GESP Sync → Compliance → Alerts ==========

    // 1. Immediate GESP Sync with priority=urgent
    try {
      const gespDispatch = await dispatchOperacionalGESP(
        company.id,
        company.razao_social,
        orquestradorId,
        URGENT_PRIORITY,
        tokenTracker,
        state
      );
      state.dispatches!.push(gespDispatch);
    } catch (error) {
      const errMsg = `GESP sync failed: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`[Orquestrador] ${errMsg}`);
      state.errors.push(errMsg);
    }

    // 2. Compliance Check
    try {
      const complianceDispatch = await dispatchOperacionalCompliance(
        company.id,
        company.razao_social,
        orquestradorId,
        tokenTracker,
        state
      );
      state.dispatches!.push(complianceDispatch);
    } catch (error) {
      const errMsg = `Compliance check failed: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`[Orquestrador] ${errMsg}`);
      state.errors.push(errMsg);
    }

    // 3. Send Alerts
    try {
      const alertsDispatch = await dispatchComunicadorAlerts(
        company.id,
        company.razao_social,
        orquestradorId,
        tokenTracker,
        state
      );
      state.dispatches!.push(alertsDispatch);
    } catch (error) {
      const errMsg = `Alerts dispatch failed: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`[Orquestrador] ${errMsg}`);
      state.errors.push(errMsg);
    }

    // ========== Finalize ==========
    const aggregatedTokens = state.dispatches!.reduce(
      (sum, d) => sum + (d.tokensUsed || 0),
      0
    );
    state.totalTokensUsed = aggregatedTokens;

    const healthMetrics: SystemHealthMetrics = {
      lastCycleType: URGENT_CYCLE_TYPE,
      lastCycleAt: new Date(),
      totalDispatches: state.dispatches!.length,
      successfulDispatches: state.dispatches!.filter(
        (d) => d.status === "completed"
      ).length,
      failedDispatches: state.dispatches!.filter(
        (d) => d.status === "failed"
      ).length,
      totalTokensLastCycle: aggregatedTokens,
      avgTokensPerDispatch:
        aggregatedTokens / Math.max(state.dispatches!.length, 1),
    };

    await updateSystemHealth("orquestrador", healthMetrics);
    state.systemHealthUpdates!.push(healthMetrics);

    await logAgentDecision(orquestradorId, {
      decision: "URGENT_CYCLE_COMPLETE",
      cycleType: URGENT_CYCLE_TYPE,
      action: `Urgent processing completed for ${company.razao_social}`,
      rationale: "Urgent dispatch finished successfully",
    });

    state.completedAt = new Date();
    await completeAgentRun(orquestradorId, "orquestrador", "completed", {}, undefined, undefined);

    return state;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Orquestrador] Unhandled error in urgent cycle: ${errMsg}`);
    state.errors.push(errMsg);

    state.completedAt = new Date();
    await completeAgentRun(orquestradorId, "orquestrador", "failed", {}, undefined, errMsg);

    return state;
  }
}

/**
 * Process companies in parallel batches (FULL CYCLE)
 * Each batch processes up to batchSize companies in parallel
 * One company failing does NOT stop the batch
 */
async function processCompanyBatch(
  companies: { id: string; razao_social: string }[],
  batchSize: number,
  cycleType: string,
  dispatches: AgentDispatch[],
  orquestradorId: string,
  tokenTracker: TokenTracker,
  state: OrquestradorState
): Promise<void> {
  // Split into batches
  const batches = [];
  for (let i = 0; i < companies.length; i += batchSize) {
    batches.push(companies.slice(i, i + batchSize));
  }

  // FIX: IA-06 — Add concurrency limiting to prevent race conditions
  const limiter = createConcurrencyLimiter(3); // Max 3 concurrent companies

  // Process each batch sequentially
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];

    // Stagger batch start
    if (batchIndex > 0) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }

    // Process all companies in this batch in parallel with concurrency limit
    const batchPromises = batch.map((company) =>
      limiter.run(async () => {
        try {
          await processSingleCompanyFull(
            company,
            cycleType,
            dispatches,
            orquestradorId,
            tokenTracker,
            state
          );
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          console.error(
            `[Orquestrador] Error processing company ${company.id}: ${errMsg}`
          );
          state.errors.push(
            `Company ${company.razao_social} (${company.id}): ${errMsg}`
          );
        }
      })
    );

    await Promise.all(batchPromises);
  }
}

/**
 * Process a single company (FULL CYCLE): Email → GESP → Compliance → Alerts
 * Failures in one agent don't stop processing of remaining agents
 */
async function processSingleCompanyFull(
  company: { id: string; razao_social: string },
  cycleType: string,
  dispatches: AgentDispatch[],
  orquestradorId: string,
  tokenTracker: TokenTracker,
  state: OrquestradorState
): Promise<void> {
  try {

    // 1. Captador Email Read
    try {
      const emailDispatch = await dispatchCaptadorEmail(
        company.id,
        company.razao_social,
        orquestradorId,
        tokenTracker,
        state
      );
      dispatches.push(emailDispatch);
    } catch (error) {
      const errMsg = `Email read failed: ${error instanceof Error ? error.message : String(error)}`;
      console.error(
        `[Orquestrador] ${company.razao_social}: ${errMsg}`
      );
      state.errors.push(`${company.razao_social} Email: ${errMsg}`);
      // Continue to next agent
    }

    // 2. Operacional GESP Sync
    try {
      const gespDispatch = await dispatchOperacionalGESP(
        company.id,
        company.razao_social,
        orquestradorId,
        undefined, // normal priority
        tokenTracker,
        state
      );
      dispatches.push(gespDispatch);
    } catch (error) {
      const errMsg = `GESP sync failed: ${error instanceof Error ? error.message : String(error)}`;
      console.error(
        `[Orquestrador] ${company.razao_social}: ${errMsg}`
      );
      state.errors.push(`${company.razao_social} GESP: ${errMsg}`);
      // Continue to next agent
    }

    // 3. Operacional Compliance
    try {
      const complianceDispatch = await dispatchOperacionalCompliance(
        company.id,
        company.razao_social,
        orquestradorId,
        tokenTracker,
        state
      );
      dispatches.push(complianceDispatch);
    } catch (error) {
      const errMsg = `Compliance check failed: ${error instanceof Error ? error.message : String(error)}`;
      console.error(
        `[Orquestrador] ${company.razao_social}: ${errMsg}`
      );
      state.errors.push(`${company.razao_social} Compliance: ${errMsg}`);
      // Continue to next agent
    }

    // 4. Comunicador Alerts
    try {
      const alertsDispatch = await dispatchComunicadorAlerts(
        company.id,
        company.razao_social,
        orquestradorId,
        tokenTracker,
        state
      );
      dispatches.push(alertsDispatch);
    } catch (error) {
      const errMsg = `Alerts dispatch failed: ${error instanceof Error ? error.message : String(error)}`;
      console.error(
        `[Orquestrador] ${company.razao_social}: ${errMsg}`
      );
      state.errors.push(`${company.razao_social} Alerts: ${errMsg}`);
      // Continue anyway
    }

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Orquestrador] Fatal error for ${company.id}: ${errMsg}`);
    state.errors.push(`${company.razao_social}: FATAL ${errMsg}`);
  }
}

/**
 * Process companies in parallel batches (LIGHT CYCLE)
 * Email Read only (no GESP, no Compliance)
 */
async function processCompanyBatchLight(
  companies: { id: string; razao_social: string }[],
  batchSize: number,
  dispatches: AgentDispatch[],
  orquestradorId: string,
  tokenTracker: TokenTracker,
  state: OrquestradorState
): Promise<void> {
  const batches = [];
  for (let i = 0; i < companies.length; i += batchSize) {
    batches.push(companies.slice(i, i + batchSize));
  }

  // FIX: IA-06 — Add concurrency limiting to prevent race conditions
  const limiter = createConcurrencyLimiter(3); // Max 3 concurrent companies

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];

    if (batchIndex > 0) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }

    const batchPromises = batch.map((company) =>
      limiter.run(async () => {
        try {
          await processSingleCompanyLight(
            company,
            dispatches,
            orquestradorId,
            tokenTracker,
            state
          );
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          console.error(
            `[Orquestrador] LIGHT: Error processing company ${company.id}: ${errMsg}`
          );
          state.errors.push(
            `LIGHT: ${company.razao_social} (${company.id}): ${errMsg}`
          );
        }
      })
    );

    await Promise.all(batchPromises);
  }
}

/**
 * Process a single company (LIGHT CYCLE): Email Read only
 */
async function processSingleCompanyLight(
  company: { id: string; razao_social: string },
  dispatches: AgentDispatch[],
  orquestradorId: string,
  tokenTracker: TokenTracker,
  state: OrquestradorState
): Promise<void> {
  try {

    const emailDispatch = await dispatchCaptadorEmail(
      company.id,
      company.razao_social,
      orquestradorId,
      tokenTracker,
      state
    );
    dispatches.push(emailDispatch);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Orquestrador] LIGHT: ${company.razao_social}: ${errMsg}`);
    state.errors.push(`LIGHT: ${company.razao_social} Email: ${errMsg}`);
  }
}

/**
 * Dispatch helpers: Each wrapper adds job to queue and tracks dispatch
 */

async function dispatchCaptadorDOU(
  orquestradorId: string,
  tokenTracker: TokenTracker,
  state: OrquestradorState
): Promise<AgentDispatch> {
  const dispatchId = `dispatch-dou-${Date.now()}`;

  const dispatch: DispatchRecord = {
    id: dispatchId,
    orquestradorId,
    agentType: "captador",
    agentSubtype: "dou",
    companyId: null,
    status: "queued",
    queuedAt: new Date(),
    startedAt: null,
    completedAt: null,
    tokensUsed: 0,
    error: null,
  };

  try {
    const jobId = await addCaptadorDOUJob({
      dispatchId,
      orquestradorId,
    });

    dispatch.jobId = jobId;
    dispatch.status = "running";
    dispatch.startedAt = new Date();

    // FIX: IA-01 — Poll actual job status with timeout instead of marking complete immediately
    const pollResult = await pollJobCompletion(jobId.id!, DISPATCH_TIMEOUT_MS);
    dispatch.status = pollResult.status;
    dispatch.completedAt = new Date();
    if (pollResult.error) {
      dispatch.error = pollResult.error;
      const metrics = state.metricsAggregated as Record<string, Record<string, number>>;
      metrics.captadorDOU.failed += 1;
    } else {
      const metrics = state.metricsAggregated as Record<string, Record<string, number>>;
      metrics.captadorDOU.success += 1;
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Orquestrador] DOU dispatch error: ${errMsg}`);
    dispatch.status = "failed";
    dispatch.error = errMsg;
    dispatch.completedAt = new Date();
    const metrics = state.metricsAggregated as Record<string, Record<string, number>>;
    metrics.captadorDOU.failed += 1;
  }

  return dispatch as unknown as AgentDispatch;
}

async function dispatchCaptadorEmail(
  companyId: string,
  companySocial: string,
  orquestradorId: string,
  tokenTracker: TokenTracker,
  state: OrquestradorState
): Promise<AgentDispatch> {
  const dispatchId = `dispatch-email-${companyId}-${Date.now()}`;

  const dispatch: DispatchRecord = {
    id: dispatchId,
    orquestradorId,
    agentType: "captador",
    agentSubtype: "email",
    companyId,
    status: "queued",
    queuedAt: new Date(),
    startedAt: null,
    completedAt: null,
    tokensUsed: 0,
    error: null,
  };

  try {
    const jobId = await addCaptadorEmailJob({
      dispatchId,
      orquestradorId,
      companyId,
    });

    dispatch.jobId = jobId;
    dispatch.status = "running";
    dispatch.startedAt = new Date();

    // FIX: IA-01 — Poll actual job status with timeout instead of marking complete immediately
    const pollResult = await pollJobCompletion(jobId.id!, DISPATCH_TIMEOUT_MS);
    dispatch.status = pollResult.status;
    dispatch.completedAt = new Date();
    dispatch.tokensUsed = 0;

    if (pollResult.error) {
      dispatch.error = pollResult.error;
      const metrics = state.metricsAggregated as Record<string, Record<string, number>>;
      metrics.captadorEmail.failed += 1;
    } else {
      const metrics = state.metricsAggregated as Record<string, Record<string, number>>;
      metrics.captadorEmail.success += 1;
    }
    const metrics = state.metricsAggregated as Record<string, Record<string, number>>;
    metrics.captadorEmail.tokensUsed += dispatch.tokensUsed;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(
      `[Orquestrador] Email dispatch error for ${companySocial}: ${errMsg}`
    );
    dispatch.status = "failed";
    dispatch.error = errMsg;
    dispatch.completedAt = new Date();
    const metrics = state.metricsAggregated as Record<string, Record<string, number>>;
    metrics.captadorEmail.failed += 1;
  }

  return dispatch as unknown as AgentDispatch;
}

async function dispatchOperacionalGESP(
  companyId: string,
  companySocial: string,
  orquestradorId: string,
  priority: string | undefined,
  tokenTracker: TokenTracker,
  state: OrquestradorState
): Promise<AgentDispatch> {
  const dispatchId = `dispatch-gesp-${companyId}-${Date.now()}`;

  const dispatch: DispatchRecord = {
    id: dispatchId,
    orquestradorId,
    agentType: "operacional",
    agentSubtype: "gesp",
    companyId,
    status: "queued",
    queuedAt: new Date(),
    startedAt: null,
    completedAt: null,
    tokensUsed: 0,
    error: null,
  };

  try {
    const jobId = await addOperacionalGESPJob({
      dispatchId,
      orquestradorId,
      companyId,
      priority,
    });

    dispatch.jobId = jobId;
    dispatch.status = "running";
    dispatch.startedAt = new Date();

    // FIX: IA-01 — Poll actual job status with timeout instead of marking complete immediately
    const pollResult = await pollJobCompletion(jobId.id!, DISPATCH_TIMEOUT_MS);
    dispatch.status = pollResult.status;
    dispatch.completedAt = new Date();
    dispatch.tokensUsed = 0;

    if (pollResult.error) {
      dispatch.error = pollResult.error;
      const metrics = state.metricsAggregated as Record<string, Record<string, number>>;
      metrics.operacionalGESP.failed += 1;
    } else {
      const metrics = state.metricsAggregated as Record<string, Record<string, number>>;
      metrics.operacionalGESP.success += 1;
    }
    const metrics = state.metricsAggregated as Record<string, Record<string, number>>;
    metrics.operacionalGESP.tokensUsed += dispatch.tokensUsed;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(
      `[Orquestrador] GESP dispatch error for ${companySocial}: ${errMsg}`
    );
    dispatch.status = "failed";
    dispatch.error = errMsg;
    dispatch.completedAt = new Date();
    const metrics = state.metricsAggregated as Record<string, Record<string, number>>;
    metrics.operacionalGESP.failed += 1;
  }

  return dispatch as unknown as AgentDispatch;
}

async function dispatchOperacionalCompliance(
  companyId: string,
  companySocial: string,
  orquestradorId: string,
  tokenTracker: TokenTracker,
  state: OrquestradorState
): Promise<AgentDispatch> {
  const dispatchId = `dispatch-compliance-${companyId}-${Date.now()}`;

  const dispatch: DispatchRecord = {
    id: dispatchId,
    orquestradorId,
    agentType: "operacional",
    agentSubtype: "compliance",
    companyId,
    status: "queued",
    queuedAt: new Date(),
    startedAt: null,
    completedAt: null,
    tokensUsed: 0,
    error: null,
  };

  try {
    const jobId = await addOperacionalComplianceJob({
      dispatchId,
      orquestradorId,
      companyId,
    });

    dispatch.jobId = jobId;
    dispatch.status = "running";
    dispatch.startedAt = new Date();

    // FIX: IA-01 — Poll actual job status with timeout instead of marking complete immediately
    const pollResult = await pollJobCompletion(jobId.id!, DISPATCH_TIMEOUT_MS);
    dispatch.status = pollResult.status;
    dispatch.completedAt = new Date();
    dispatch.tokensUsed = 0;

    if (pollResult.error) {
      dispatch.error = pollResult.error;
      const metrics = state.metricsAggregated as Record<string, Record<string, number>>;
      metrics.operacionalCompliance.failed += 1;
    } else {
      const metrics = state.metricsAggregated as Record<string, Record<string, number>>;
      metrics.operacionalCompliance.success += 1;
    }
    const metrics = state.metricsAggregated as Record<string, Record<string, number>>;
    metrics.operacionalCompliance.tokensUsed += dispatch.tokensUsed;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(
      `[Orquestrador] Compliance dispatch error for ${companySocial}: ${errMsg}`
    );
    dispatch.status = "failed";
    dispatch.error = errMsg;
    dispatch.completedAt = new Date();
    const metrics = state.metricsAggregated as Record<string, Record<string, number>>;
    metrics.operacionalCompliance.failed += 1;
  }

  return dispatch as unknown as AgentDispatch;
}

async function dispatchComunicadorAlerts(
  companyId: string,
  companySocial: string,
  orquestradorId: string,
  tokenTracker: TokenTracker,
  state: OrquestradorState
): Promise<AgentDispatch> {
  const dispatchId = `dispatch-alerts-${companyId}-${Date.now()}`;

  const dispatch: DispatchRecord = {
    id: dispatchId,
    orquestradorId,
    agentType: "comunicador",
    agentSubtype: "alerts",
    companyId,
    status: "queued",
    queuedAt: new Date(),
    startedAt: null,
    completedAt: null,
    tokensUsed: 0,
    error: null,
  };

  try {
    const jobId = await addComunicadorAlertsJob({
      dispatchId,
      orquestradorId,
      companyId,
    });

    dispatch.jobId = jobId;
    dispatch.status = "running";
    dispatch.startedAt = new Date();

    // FIX: IA-01 — Poll actual job status with timeout instead of marking complete immediately
    const pollResult = await pollJobCompletion(jobId.id!, DISPATCH_TIMEOUT_MS);
    dispatch.status = pollResult.status;
    dispatch.completedAt = new Date();
    dispatch.tokensUsed = 0;

    if (pollResult.error) {
      dispatch.error = pollResult.error;
      const metrics = state.metricsAggregated as Record<string, Record<string, number>>;
      metrics.comunicadorAlerts.failed += 1;
    } else {
      const metrics = state.metricsAggregated as Record<string, Record<string, number>>;
      metrics.comunicadorAlerts.success += 1;
    }
    const metrics = state.metricsAggregated as Record<string, Record<string, number>>;
    metrics.comunicadorAlerts.tokensUsed += dispatch.tokensUsed;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(
      `[Orquestrador] Alerts dispatch error for ${companySocial}: ${errMsg}`
    );
    dispatch.status = "failed";
    dispatch.error = errMsg;
    dispatch.completedAt = new Date();
    const metrics = state.metricsAggregated as Record<string, Record<string, number>>;
    metrics.comunicadorAlerts.failed += 1;
  }

  return dispatch as unknown as AgentDispatch;
}

async function dispatchBillingCheck(
  orquestradorId: string,
  tokenTracker: TokenTracker,
  state: OrquestradorState
): Promise<AgentDispatch> {
  const dispatchId = `dispatch-billing-${Date.now()}`;

  const dispatch: DispatchRecord = {
    id: dispatchId,
    orquestradorId,
    agentType: "operacional",
    agentSubtype: "workflow",
    companyId: null,
    status: "queued",
    queuedAt: new Date(),
    startedAt: null,
    completedAt: null,
    tokensUsed: 0,
    error: null,
  };

  try {
    const jobId = await addBillingCheckJob({
      dispatchId,
      orquestradorId,
    });

    dispatch.jobId = jobId;
    dispatch.status = "running";
    dispatch.startedAt = new Date();

    // FIX: IA-01 — Poll actual job status with timeout instead of marking complete immediately
    const pollResult = await pollJobCompletion(jobId.id!, DISPATCH_TIMEOUT_MS);
    dispatch.status = pollResult.status;
    dispatch.completedAt = new Date();
    dispatch.tokensUsed = 0;

    if (pollResult.error) {
      dispatch.error = pollResult.error;
      const metrics = state.metricsAggregated as Record<string, Record<string, number>>;
      metrics.operacionalWorkflow.failed += 1;
    } else {
      const metrics = state.metricsAggregated as Record<string, Record<string, number>>;
      metrics.operacionalWorkflow.success += 1;
    }
    const metrics = state.metricsAggregated as Record<string, Record<string, number>>;
    metrics.operacionalWorkflow.tokensUsed += dispatch.tokensUsed;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Orquestrador] Billing dispatch error: ${errMsg}`);
    dispatch.status = "failed";
    dispatch.error = errMsg;
    dispatch.completedAt = new Date();
    const metrics = state.metricsAggregated as Record<string, Record<string, number>>;
    metrics.operacionalWorkflow.failed += 1;
  }

  return dispatch as unknown as AgentDispatch;
}
