/**
 * VIGI Agents — Base Infrastructure
 * Handles run lifecycle, decision logging, token tracking, DB persistence.
 * All 4 agents extend this base.
 *
 * GAP-02 FIX: IML events are emitted automatically from startAgentRun /
 * completeAgentRun so ALL agents get IML coverage without code changes.
 *
 * TD-05 FIX: TokenTracker is now in @/lib/core/token-tracker to break
 * bidirectional dependency with cognitive module.
 */
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/iml/event-graph";
import type {
  AgentName,
  TriggerType,
  AgentRunStatus,
  AgentStep,
  SystemHealthMetrics,
} from "./types";
// TD-05: Re-export TokenTracker from core module for backward compatibility
export { TokenTracker, type ITokenTracker } from "@/lib/core/token-tracker";

// Lazy init: avoid calling createSupabaseAdmin() at module load time
// (breaks Next.js build phase when env vars aren't available)
let _supabase: ReturnType<typeof createSupabaseAdmin> | null = null;
function getSupabase() {
  if (!_supabase) _supabase = createSupabaseAdmin();
  return _supabase;
}
const supabase = new Proxy({} as ReturnType<typeof createSupabaseAdmin>, {
  get(_target, prop) {
    return (getSupabase() as Record<string | symbol, unknown>)[prop];
  },
});

// --- Run Lifecycle ---

interface StartAgentRunParams {
  agent_name: AgentName;
  run_type: TriggerType;
  input_data?: Record<string, unknown>;
  company_id?: string;
}

interface StartAgentRunResult {
  runId: string;
}

export async function startAgentRun(
  params: StartAgentRunParams | AgentName,
  triggerType?: TriggerType,
  triggerSource?: string,
  companyId?: string,
  inputData?: Record<string, unknown>
): Promise<StartAgentRunResult | string> {
  // Support both object and positional parameter styles
  let agentName: AgentName;
  let runType: TriggerType;
  let source: string;
  let cId: string | undefined;
  let data: Record<string, unknown> = {};

  if (typeof params === "object" && params !== null) {
    // Object parameter style (from captador)
    agentName = params.agent_name;
    runType = params.run_type;
    source = params.run_type; // Use run_type as source for captador
    cId = params.company_id;
    data = params.input_data || {};
  } else {
    // Positional parameter style (from operacional, comunicador, orquestrador)
    agentName = params as AgentName;
    runType = triggerType!;
    source = triggerSource!;
    cId = companyId;
    data = inputData || {};
  }

  // FIX: IA-07 — Check for stale "running" records (>30 min) and clean up
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: staleRuns } = await supabase
    .from("agent_runs")
    .select("id")
    .eq("agent_name", agentName)
    .eq("status", "running")
    .lt("started_at", thirtyMinutesAgo);

  if (staleRuns && staleRuns.length > 0) {
    // Mark stale runs as failed to prevent duplicate processing
    await supabase
      .from("agent_runs")
      .update({ status: "failed", error_message: "Stale run detected (>30min) and cleaned up by IA-07" })
      .in("id", staleRuns.map(r => r.id));
    console.warn(`[AGENT:${agentName}] Cleaned up ${staleRuns.length} stale running records`);
  }

  // FIX: IA-07 — Generate deterministic run ID based on agent + timestamp window (5 min window for idempotency)
  const timestampWindow = Math.floor(Date.now() / (5 * 60 * 1000)); // 5-minute window
  const _deterministicId = `${agentName}-${cId || "global"}-${timestampWindow}`;

  // Check if we already have a recent run with this deterministic ID
  const { data: existingRuns } = await supabase
    .from("agent_runs")
    .select("id")
    .eq("agent_name", agentName)
    .eq("company_id", cId || null)
    .eq("trigger_type", runType)
    .gte("started_at", new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .limit(1);

  if (existingRuns && existingRuns.length > 0) {
    // Return existing run (idempotent)
    const runId = existingRuns[0].id;
    if (typeof params === "object") {
      return { runId };
    } else {
      return runId;
    }
  }

  const { data: result, error } = await supabase
    .from("agent_runs")
    .insert({
      agent_name: agentName,
      trigger_type: runType,
      trigger_source: source,
      company_id: cId || null,
      status: "running",
      input_data: data,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !result) {
    console.error(`[AGENT:${agentName}] Failed to start run:`, error);
    throw new Error(`Failed to start agent run: ${error?.message}`);
  }

  // GAP-02: Emit IML "run started" event automatically (non-blocking)
  emitEvent({
    eventType: "DECISAO_AGENTE",
    entityType: "agent_run",
    entityId: result.id,
    agentName,
    agentRunId: result.id,
    companyId: cId,
    metadata: {
      action: "run_started",
      trigger_type: runType,
      trigger_source: source,
      input_keys: Object.keys(data),
    },
    severity: "info",
  }).catch(() => { /* IML failure never blocks agents */ });

  // Return both styles for compatibility
  if (typeof params === "object") {
    return { runId: result.id };
  } else {
    return result.id;
  }
}

interface CompleteAgentRunParams {
  runId: string;
  status: AgentRunStatus;
  output_data?: Record<string, unknown>;
}

export async function completeAgentRun(
  runIdOrParams: string | CompleteAgentRunParams,
  agentName?: AgentName,
  status?: AgentRunStatus,
  outputData?: Record<string, unknown>,
  tokenStats?: { total: number; cost: number; cacheRead: number; cacheWrite: number; steps: number },
  errorMessage?: string
): Promise<void> {
  let runId: string;
  let finalStatus: AgentRunStatus;
  let finalOutputData: Record<string, unknown> = {};
  let finalTokenStats: { total: number; cost: number; cacheRead: number; cacheWrite: number; steps: number };
  let finalAgentName: AgentName = "operacional"; // fallback
  let finalErrorMessage: string | undefined;

  if (typeof runIdOrParams === "object") {
    // Object parameter style (from captador)
    runId = runIdOrParams.runId;
    finalStatus = runIdOrParams.status;
    finalOutputData = runIdOrParams.output_data || {};
    finalTokenStats = { total: 0, cost: 0, cacheRead: 0, cacheWrite: 0, steps: 0 };
  } else {
    // Positional parameter style (from operacional, comunicador)
    runId = runIdOrParams;
    finalStatus = status!;
    finalAgentName = agentName!;
    finalOutputData = outputData || {};
    finalTokenStats = tokenStats || { total: 0, cost: 0, cacheRead: 0, cacheWrite: 0, steps: 0 };
    finalErrorMessage = errorMessage;
  }

  const now = new Date().toISOString();

  // Get started_at for duration calc
  const { data: run } = await supabase
    .from("agent_runs")
    .select("started_at")
    .eq("id", runId)
    .single();

  const durationMs = run
    ? new Date(now).getTime() - new Date(run.started_at).getTime()
    : 0;

  await supabase
    .from("agent_runs")
    .update({
      status: finalStatus,
      output_data: finalOutputData,
      error_message: finalErrorMessage || null,
      completed_at: now,
      duration_ms: durationMs,
      total_tokens_used: finalTokenStats.total,
      total_cost_usd: finalTokenStats.cost,
      cache_read_tokens: finalTokenStats.cacheRead,
      cache_write_tokens: finalTokenStats.cacheWrite,
      steps_executed: finalTokenStats.steps,
    })
    .eq("id", runId);

  // GAP-02: Emit IML "run completed/failed" event automatically (non-blocking)
  const imlEventType = finalStatus === "failed" ? "ERRO_SISTEMA" : "DECISAO_AGENTE";
  const imlSeverity = finalStatus === "failed" ? "high" : "info";
  emitEvent({
    eventType: imlEventType,
    entityType: "agent_run",
    entityId: runId,
    agentName: finalAgentName,
    agentRunId: runId,
    metadata: {
      action: finalStatus === "failed" ? "run_failed" : "run_completed",
      duration_ms: durationMs,
      tokens_total: finalTokenStats.total,
      cost_usd: finalTokenStats.cost,
      ...(finalErrorMessage ? { error: finalErrorMessage } : {}),
    },
    severity: imlSeverity,
  }).catch(() => { /* IML failure never blocks agents */ });
}

// --- Decision Logging ---

interface LogAgentDecisionParams {
  run_id?: string;
  agent_run_id?: string;
  agent_name?: string;
  step_name?: string;
  decision_type: string;
  input_data?: Record<string, unknown>;
  input_summary?: string;
  output_data?: Record<string, unknown>;
  output_summary?: string;
  model_used?: string;
  confidence?: number;
  tokens_input?: number;
  tokens_output?: number;
  latency_ms?: number;
  escalated_to_human?: boolean;
  reasoning?: string;
  [key: string]: unknown;
}

interface LogAgentDecisionResult {
  decisionId?: string;
}

export async function logAgentDecision(
  paramsOrRunId: LogAgentDecisionParams | string,
  decisionData?: Record<string, unknown>
): Promise<LogAgentDecisionResult> {
  let recordToInsert: Record<string, unknown>;

  if (typeof paramsOrRunId === "object") {
    // Object parameter style (from captador, operacional, comunicador)
    const params = paramsOrRunId as LogAgentDecisionParams;
    const runId = params.agent_run_id || params.run_id;

    recordToInsert = {
      run_id: runId,
      agent_name: params.agent_name,
      step_name: params.step_name || "default",
      decision_type: params.decision_type,
      input_summary: params.input_summary || (params.input_data ? JSON.stringify(params.input_data) : undefined),
      output_summary: params.output_summary || (params.output_data ? JSON.stringify(params.output_data) : undefined),
      confidence: params.confidence || 0.5,
      model_used: params.model_used,
      tokens_input: params.tokens_input || 0,
      tokens_output: params.tokens_output || 0,
      latency_ms: params.latency_ms,
      escalated_to_human: params.escalated_to_human || false,
      human_override: params.reasoning,
    };
  } else {
    // Positional parameter style (from orquestrador)
    recordToInsert = decisionData || {};
  }

  const { data, error } = await supabase
    .from("agent_decisions")
    .insert(recordToInsert)
    .select("id")
    .single();

  if (error) {
    // FIX: IA-09 — Proper error escalation instead of silent swallowing
    console.error(`[AGENT] Failed to log decision:`, error);

    // Log to system_events for monitoring
    try {
      await supabase.from("system_events").insert({
        tipo: "agent_decision_logging_failed",
        severidade: "warning",
        mensagem: `Failed to log agent decision: ${error.message}`,
        detalhes: {
          error: error,
          recordAttempted: recordToInsert,
        },
      });
    } catch (logErr) {
      console.error(`[AGENT] Also failed to log decision error to system_events:`, logErr);
    }

    // Re-throw to let caller handle, rather than silently swallowing
    throw new Error(`Failed to log agent decision: ${error.message}`);
  }

  return { decisionId: data?.id };
}

// --- System Health ---

export async function updateSystemHealth(
  component: string,
  metrics: SystemHealthMetrics | "healthy" | "degraded" | "unhealthy" | "offline",
  details?: Record<string, unknown>
): Promise<void> {
  let status: "healthy" | "degraded" | "unhealthy" | "offline" = "healthy";
  let detailsToSave: Record<string, unknown> = {};

  if (typeof metrics === "object") {
    // Metrics object style (from orquestrador)
    status = "healthy";
    detailsToSave = metrics as Record<string, unknown>;
  } else {
    // String status style (legacy)
    status = metrics as "healthy" | "degraded" | "unhealthy" | "offline";
    detailsToSave = details || {};
  }

  await supabase
    .from("system_health")
    .upsert({
      component,
      status,
      last_heartbeat: new Date().toISOString(),
      details: detailsToSave,
      updated_at: new Date().toISOString(),
    }, { onConflict: "component" });
}


// --- Step Helper ---

export function createStep(name: string): AgentStep {
  return {
    name,
    status: "pending",
  };
}

export function startStep(step: AgentStep): AgentStep {
  return { ...step, status: "running", startedAt: new Date().toISOString() };
}

export function completeStep(step: AgentStep, output?: Record<string, unknown>): AgentStep {
  const now = new Date().toISOString();
  const durationMs = step.startedAt
    ? new Date(now).getTime() - new Date(step.startedAt).getTime()
    : 0;
  return { ...step, status: "completed", completedAt: now, durationMs, output };
}

export function failStep(step: AgentStep, error: string): AgentStep {
  return { ...step, status: "failed", completedAt: new Date().toISOString(), output: { error } };
}
