/**
 * TD-08: Agent Runs Repository
 * Encapsulates all database operations for agent_runs table
 * Provides a clean abstraction over Supabase client
 */

import { createSupabaseAdmin } from "@/lib/supabase/server";

export interface AgentRunRecord {
  id?: string;
  agent_name: "captador" | "operacional" | "comunicador" | "orquestrador";
  trigger_type: "cron" | "webhook" | "manual" | "urgent" | "chain";
  trigger_source?: string;
  company_id?: string;
  status: "running" | "completed" | "failed" | "timeout" | "cancelled";
  input_data?: Record<string, unknown>;
  output_data?: Record<string, unknown>;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
  total_tokens_used?: number;
  total_cost_usd?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  steps_executed?: number;
  created_at?: string;
}

export class AgentRunsRepository {
  private supabase = createSupabaseAdmin();

  async create(run: Omit<AgentRunRecord, "id" | "created_at">) {
    const { data, error } = await this.supabase
      .from("agent_runs")
      .insert(run)
      .select()
      .single();
    if (error) throw new Error(`Failed to create agent run: ${error.message}`);
    return data as AgentRunRecord;
  }

  async updateStatus(
    id: string,
    status: AgentRunRecord["status"],
    options?: {
      output?: Record<string, unknown>;
      error?: string;
      tokenStats?: {
        total: number;
        cost: number;
        cacheRead: number;
        cacheWrite: number;
        steps: number;
      };
    }
  ) {
    const update: Record<string, unknown> = { status };
    if (options?.output) update.output_data = options.output;
    if (options?.error) update.error_message = options.error;
    if (options?.tokenStats) {
      update.total_tokens_used = options.tokenStats.total;
      update.total_cost_usd = options.tokenStats.cost;
      update.cache_read_tokens = options.tokenStats.cacheRead;
      update.cache_write_tokens = options.tokenStats.cacheWrite;
      update.steps_executed = options.tokenStats.steps;
    }
    if (status === "completed" || status === "failed" || status === "timeout" || status === "cancelled") {
      update.completed_at = new Date().toISOString();
    }
    const { data, error: dbError } = await this.supabase
      .from("agent_runs")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (dbError) throw new Error(`Failed to update agent run: ${dbError.message}`);
    return data as AgentRunRecord;
  }

  async getById(id: string) {
    const { data, error } = await this.supabase
      .from("agent_runs")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw new Error(`Failed to get agent run: ${error.message}`);
    return data as AgentRunRecord;
  }

  async getRecent(filters?: { agentName?: string; companyId?: string; status?: string; limit?: number }) {
    const limit = filters?.limit ?? 20;
    let query = this.supabase
      .from("agent_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (filters?.agentName) query = query.eq("agent_name", filters.agentName);
    if (filters?.companyId) query = query.eq("company_id", filters.companyId);
    if (filters?.status) query = query.eq("status", filters.status);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to get recent runs: ${error.message}`);
    return (data ?? []) as AgentRunRecord[];
  }

  async getStaleRuns(agentName: string, minutesOld: number = 30) {
    const thresholdTime = new Date(Date.now() - minutesOld * 60 * 1000).toISOString();
    const { data, error } = await this.supabase
      .from("agent_runs")
      .select("id")
      .eq("agent_name", agentName)
      .eq("status", "running")
      .lt("started_at", thresholdTime);

    if (error) throw new Error(`Failed to get stale runs: ${error.message}`);
    return (data ?? []) as { id: string }[];
  }

  async markStaleAsFailed(ids: string[], reason: string) {
    const { error } = await this.supabase
      .from("agent_runs")
      .update({
        status: "failed",
        error_message: reason,
        completed_at: new Date().toISOString(),
      })
      .in("id", ids);

    if (error) throw new Error(`Failed to mark runs as failed: ${error.message}`);
  }

  async getRecentByAgentAndCompany(
    agentName: string,
    companyId: string | null,
    triggerType: string,
    withinMinutes: number = 5
  ) {
    const thresholdTime = new Date(Date.now() - withinMinutes * 60 * 1000).toISOString();
    const { data, error } = await this.supabase
      .from("agent_runs")
      .select("id")
      .eq("agent_name", agentName)
      .eq("company_id", companyId)
      .eq("trigger_type", triggerType)
      .gte("started_at", thresholdTime)
      .limit(1);

    if (error) throw new Error(`Failed to get recent runs: ${error.message}`);
    return data as { id: string }[] | null;
  }
}
