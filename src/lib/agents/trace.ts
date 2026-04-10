/**
 * VIGI Agent Trace System
 * Complete execution logging system that saves all agent actions per company
 * Uses Supabase for metadata and R2 for heavy payloads
 */

import { createSupabaseAdmin } from "@/lib/supabase/server";
import { uploadToR2 } from "@/lib/r2/client";
import type { AgentName } from "./types";

/**
 * Single step within an agent trace
 */
export interface TraceStep {
  stepIndex: number;
  action: string; // e.g., "gesp_click", "field_fill", "screenshot", "classify", "navigate", "email_render"
  target?: string; // e.g., field name, URL, button label
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  duration_ms?: number;
  success: boolean;
  error?: string;
  screenshot_r2_key?: string;
  timestamp: string;
}

/**
 * Complete agent trace record
 */
export interface AgentTrace {
  trace_id: string;
  run_id: string;
  agent_name: AgentName;
  company_id: string;
  trigger_type: string;
  started_at: string;
  completed_at?: string;
  status: "running" | "completed" | "failed";
  steps: TraceStep[];
  total_steps: number;
  successful_steps: number;
  failed_steps: number;
  total_duration_ms: number;
  tokens_used: number;
  cost_usd: number;
  r2_trace_key?: string; // path to full trace JSON in R2
}

/**
 * Collects and manages traces for agent execution
 */
export class TraceCollector {
  private trace: AgentTrace;
  private steps: TraceStep[] = [];
  private startTime: number;

  constructor(
    runId: string,
    agentName: AgentName,
    companyId: string,
    triggerType: string
  ) {
    this.startTime = Date.now();
    this.trace = {
      trace_id: crypto.randomUUID(),
      run_id: runId,
      agent_name: agentName,
      company_id: companyId,
      trigger_type: triggerType,
      started_at: new Date().toISOString(),
      status: "running",
      steps: [],
      total_steps: 0,
      successful_steps: 0,
      failed_steps: 0,
      total_duration_ms: 0,
      tokens_used: 0,
      cost_usd: 0,
    };
  }

  /**
   * Add a step to the trace
   */
  addStep(step: Omit<TraceStep, "stepIndex" | "timestamp">): void {
    try {
      const traceStep: TraceStep = {
        ...step,
        stepIndex: this.steps.length,
        timestamp: new Date().toISOString(),
      };
      this.steps.push(traceStep);
      this.trace.total_steps += 1;
      if (step.success) {
        this.trace.successful_steps += 1;
      } else {
        this.trace.failed_steps += 1;
      }
    } catch (error) {
      // Non-blocking: log error but don't throw
      console.error("Error adding trace step:", error);
    }
  }

  /**
   * Log a GESP click action
   */
  logClick(
    target: string,
    success: boolean,
    screenshot_r2_key?: string
  ): void {
    this.addStep({
      action: "gesp_click",
      target,
      success,
      screenshot_r2_key,
    });
  }

  /**
   * Log a field fill action
   */
  logFieldFill(fieldName: string, value: string, success: boolean): void {
    this.addStep({
      action: "field_fill",
      target: fieldName,
      input: { value },
      success,
    });
  }

  /**
   * Log a classification decision
   */
  logClassification(
    input: string,
    output: Record<string, unknown>,
    confidence: number,
    model: string
  ): void {
    this.addStep({
      action: "classify",
      input: { text: input, model },
      output: { ...output, confidence },
      success: true,
    });
  }

  /**
   * Log a navigation action
   */
  logNavigation(
    url: string,
    success: boolean,
    content_length?: number
  ): void {
    this.addStep({
      action: "navigate",
      target: url,
      output: content_length ? { content_length } : undefined,
      success,
    });
  }

  /**
   * Log an email render action
   */
  logEmailRender(
    templateId: string,
    recipient: string,
    success: boolean
  ): void {
    this.addStep({
      action: "email_render",
      target: templateId,
      input: { recipient },
      success,
    });
  }

  /**
   * Log a GESP-specific action
   */
  logGespAction(
    actionType: string,
    payload: Record<string, unknown>,
    result: Record<string, unknown>,
    success: boolean
  ): void {
    this.addStep({
      action: `gesp_${actionType}`,
      input: payload,
      output: result,
      success,
    });
  }

  /**
   * Log a screenshot action
   */
  logScreenshot(r2Key: string, description: string): void {
    this.addStep({
      action: "screenshot",
      target: description,
      screenshot_r2_key: r2Key,
      success: true,
    });
  }

  /**
   * Finalize and persist the trace
   */
  async complete(
    status: "completed" | "failed",
    tokensUsed: number = 0,
    costUsd: number = 0
  ): Promise<string> {
    try {
      const endTime = Date.now();
      this.trace.status = status;
      this.trace.completed_at = new Date().toISOString();
      this.trace.total_duration_ms = endTime - this.startTime;
      this.trace.tokens_used = tokensUsed;
      this.trace.cost_usd = costUsd;
      this.trace.steps = this.steps;

      // Persist to database and R2
      const traceId = await persistTrace(this.trace);
      return traceId;
    } catch (error) {
      // Non-blocking: log error but don't throw
      console.error("Error completing trace:", error);
      return this.trace.trace_id;
    }
  }
}

/**
 * Persist trace metadata to Supabase and full trace JSON to R2
 */
export async function persistTrace(trace: AgentTrace): Promise<string> {
  try {
    const supabase = createSupabaseAdmin();

    // Upload full trace JSON to R2
    const dateStr = new Date(trace.started_at).toISOString().split("T")[0];
    const r2Key = `traces/${trace.company_id}/${trace.agent_name}/${dateStr}/${trace.trace_id}.json`;

    try {
      await uploadToR2(
        r2Key,
        JSON.stringify(trace, null, 2),
        "application/json"
      );
      trace.r2_trace_key = r2Key;
    } catch (r2Error) {
      // Non-blocking: log but continue with DB write
      console.error("Error uploading trace to R2:", r2Error);
    }

    // Save metadata to Supabase
    const { error } = await supabase.from("agent_traces").insert([
      {
        trace_id: trace.trace_id,
        run_id: trace.run_id,
        agent_name: trace.agent_name,
        company_id: trace.company_id,
        trigger_type: trace.trigger_type,
        started_at: trace.started_at,
        completed_at: trace.completed_at,
        status: trace.status,
        total_steps: trace.total_steps,
        successful_steps: trace.successful_steps,
        failed_steps: trace.failed_steps,
        total_duration_ms: trace.total_duration_ms,
        tokens_used: trace.tokens_used,
        cost_usd: trace.cost_usd,
        r2_trace_key: trace.r2_trace_key,
      },
    ]);

    if (error) {
      // Non-blocking: log but don't throw
      console.error("Error persisting trace to database:", error);
    }

    return trace.trace_id;
  } catch (error) {
    // Non-blocking: log error but don't throw
    console.error("Error persisting trace:", error);
    return trace.trace_id;
  }
}

/**
 * Query options for getting company traces
 */
export interface GetCompanyTracesOptions {
  agentName?: AgentName;
  from?: string; // ISO 8601 date
  to?: string; // ISO 8601 date
  limit?: number;
}

/**
 * Get all traces for a company
 */
export async function getCompanyTraces(
  companyId: string,
  options?: GetCompanyTracesOptions
): Promise<AgentTrace[]> {
  try {
    const supabase = createSupabaseAdmin();

    let query = supabase
      .from("agent_traces")
      .select("*")
      .eq("company_id", companyId)
      .order("started_at", { ascending: false });

    if (options?.agentName) {
      query = query.eq("agent_name", options.agentName);
    }

    if (options?.from) {
      query = query.gte("started_at", options.from);
    }

    if (options?.to) {
      query = query.lte("started_at", options.to);
    }

    const limit = options?.limit || 100;
    query = query.limit(limit);

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching company traces:", error);
      return [];
    }

    return (data || []) as AgentTrace[];
  } catch (error) {
    console.error("Error getting company traces:", error);
    return [];
  }
}

/**
 * Get full trace detail from R2
 */
export async function getTraceDetail(traceId: string): Promise<AgentTrace | null> {
  try {
    const supabase = createSupabaseAdmin();

    // First, get the metadata to find the R2 key
    const { data, error } = await supabase
      .from("agent_traces")
      .select("r2_trace_key")
      .eq("trace_id", traceId)
      .single();

    if (error || !data?.r2_trace_key) {
      console.error("Error fetching trace metadata:", error);
      return null;
    }

    // For full trace detail, return the metadata record
    // In a real implementation, you would fetch from R2 using getFromR2
    const { data: fullData } = await supabase
      .from("agent_traces")
      .select("*")
      .eq("trace_id", traceId)
      .single();

    return (fullData as AgentTrace) || null;
  } catch (error) {
    console.error("Error getting trace detail:", error);
    return null;
  }
}

/**
 * Aggregated statistics for a company
 */
export interface TraceStats {
  total_runs: number;
  success_rate: number;
  avg_duration_ms: number;
  total_cost_usd: number;
  total_tokens_used: number;
  runs_by_agent: Record<AgentName, number>;
  runs_by_status: Record<string, number>;
}

/**
 * Get aggregated trace statistics for a company
 */
export async function getTraceStats(companyId: string): Promise<TraceStats> {
  try {
    const supabase = createSupabaseAdmin();

    const { data, error } = await supabase
      .from("agent_traces")
      .select(
        "agent_name, status, total_duration_ms, tokens_used, cost_usd"
      )
      .eq("company_id", companyId);

    if (error || !data) {
      console.error("Error fetching trace statistics:", error);
      return {
        total_runs: 0,
        success_rate: 0,
        avg_duration_ms: 0,
        total_cost_usd: 0,
        total_tokens_used: 0,
        runs_by_agent: {
          captador: 0,
          operacional: 0,
          comunicador: 0,
          orquestrador: 0,
        },
        runs_by_status: {},
      };
    }

    const totalRuns = data.length;
    const successfulRuns = data.filter(
      (row) => row.status === "completed"
    ).length;
    const successRate =
      totalRuns > 0 ? (successfulRuns / totalRuns) * 100 : 0;

    const totalDuration = data.reduce(
      (sum, row) => sum + (row.total_duration_ms || 0),
      0
    );
    const avgDuration = totalRuns > 0 ? totalDuration / totalRuns : 0;

    const totalCost = data.reduce((sum, row) => sum + (row.cost_usd || 0), 0);
    const totalTokens = data.reduce(
      (sum, row) => sum + (row.tokens_used || 0),
      0
    );

    // Count by agent name
    const runsByAgent: Record<AgentName, number> = {
      captador: 0,
      operacional: 0,
      comunicador: 0,
      orquestrador: 0,
    };
    data.forEach((row) => {
      if (row.agent_name in runsByAgent) {
        runsByAgent[row.agent_name as AgentName] += 1;
      }
    });

    // Count by status
    const runsByStatus: Record<string, number> = {};
    data.forEach((row) => {
      runsByStatus[row.status] = (runsByStatus[row.status] || 0) + 1;
    });

    return {
      total_runs: totalRuns,
      success_rate: Math.round(successRate * 100) / 100,
      avg_duration_ms: Math.round(avgDuration),
      total_cost_usd: Math.round(totalCost * 100) / 100,
      total_tokens_used: totalTokens,
      runs_by_agent: runsByAgent,
      runs_by_status: runsByStatus,
    };
  } catch (error) {
    console.error("Error calculating trace statistics:", error);
    return {
      total_runs: 0,
      success_rate: 0,
      avg_duration_ms: 0,
      total_cost_usd: 0,
      total_tokens_used: 0,
      runs_by_agent: {
        captador: 0,
        operacional: 0,
        comunicador: 0,
        orquestrador: 0,
      },
      runs_by_status: {},
    };
  }
}
