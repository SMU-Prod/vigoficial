/**
 * TD-08: GESP Tasks Repository
 * Encapsulates all database operations for gesp_tasks table
 * Provides a clean abstraction over Supabase client
 */

import { createSupabaseAdmin } from "@/lib/supabase/server";

export interface GespTaskRecord {
  id?: string;
  company_id: string;
  session_id?: string;
  workflow_id?: string;
  tipo_acao: string;
  payload: Record<string, unknown>;
  status: "pendente" | "executando" | "concluido" | "erro" | "retry";
  tentativas: number;
  max_tentativas: number;
  print_antes_r2?: string;
  print_depois_r2?: string;
  print_erro_r2?: string;
  protocolo_gesp?: string;
  erro_detalhe?: string;
  created_at?: string;
  executed_at?: string;
  completed_at?: string;
}

export class GespTasksRepository {
  private supabase = createSupabaseAdmin();

  async create(task: Omit<GespTaskRecord, "id" | "created_at">) {
    const { data, error } = await this.supabase
      .from("gesp_tasks")
      .insert(task)
      .select()
      .single();
    if (error) throw new Error(`Failed to create gesp task: ${error.message}`);
    return data as GespTaskRecord;
  }

  async getById(id: string) {
    const { data, error } = await this.supabase
      .from("gesp_tasks")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw new Error(`Failed to get gesp task: ${error.message}`);
    return data as GespTaskRecord;
  }

  async getPending(companyId?: string, limit: number = 50) {
    let query = this.supabase
      .from("gesp_tasks")
      .select("*")
      .in("status", ["pendente", "retry"])
      .order("created_at", { ascending: true })
      .limit(limit);

    if (companyId) query = query.eq("company_id", companyId);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to get pending tasks: ${error.message}`);
    return (data ?? []) as GespTaskRecord[];
  }

  async updateStatus(
    id: string,
    status: GespTaskRecord["status"],
    options?: { error?: string; protocolo?: string; printData?: Record<string, string> }
  ) {
    const update: Record<string, unknown> = { status };

    if (options?.error) update.erro_detalhe = options.error;
    if (options?.protocolo) update.protocolo_gesp = options.protocolo;
    if (options?.printData) {
      if (options.printData.antes) update.print_antes_r2 = options.printData.antes;
      if (options.printData.depois) update.print_depois_r2 = options.printData.depois;
      if (options.printData.erro) update.print_erro_r2 = options.printData.erro;
    }

    if (status === "executando") update.executed_at = new Date().toISOString();
    if (status === "concluido" || status === "erro") update.completed_at = new Date().toISOString();

    const { data, error } = await this.supabase
      .from("gesp_tasks")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(`Failed to update gesp task: ${error.message}`);
    return data as GespTaskRecord;
  }

  async incrementAttempts(id: string) {
    const task = await this.getById(id);
    const newAttempts = (task.tentativas ?? 0) + 1;
    const newStatus =
      newAttempts >= (task.max_tentativas ?? 5) ? ("erro" as const) : ("retry" as const);

    const { data, error } = await this.supabase
      .from("gesp_tasks")
      .update({
        tentativas: newAttempts,
        status: newStatus,
        completed_at: newStatus === "erro" ? new Date().toISOString() : null,
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(`Failed to increment attempts: ${error.message}`);
    return data as GespTaskRecord;
  }

  async getByCompany(companyId: string, filters?: { status?: string; limit?: number }) {
    const limit = filters?.limit ?? 100;
    let query = this.supabase
      .from("gesp_tasks")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (filters?.status) query = query.eq("status", filters.status);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to get company tasks: ${error.message}`);
    return (data ?? []) as GespTaskRecord[];
  }

  async getByWorkflow(workflowId: string) {
    const { data, error } = await this.supabase
      .from("gesp_tasks")
      .select("*")
      .eq("workflow_id", workflowId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to get workflow tasks: ${error.message}`);
    return (data ?? []) as GespTaskRecord[];
  }

  async getFailedTasks(companyId?: string, hoursOld: number = 24) {
    const thresholdTime = new Date(Date.now() - hoursOld * 60 * 60 * 1000).toISOString();
    let query = this.supabase
      .from("gesp_tasks")
      .select("*")
      .eq("status", "erro")
      .gte("created_at", thresholdTime);

    if (companyId) query = query.eq("company_id", companyId);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to get failed tasks: ${error.message}`);
    return (data ?? []) as GespTaskRecord[];
  }
}
