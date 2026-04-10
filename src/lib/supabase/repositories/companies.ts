/**
 * TD-08: Companies Repository
 * Encapsulates all database operations for companies table
 * Provides a clean abstraction over Supabase client
 */

import { createSupabaseAdmin } from "@/lib/supabase/server";

export interface CompanyRecord {
  id?: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia?: string;
  alvara_numero?: string;
  alvara_validade?: string;
  plano: "starter" | "professional" | "enterprise" | "custom";
  valor_mensal: number;
  billing_status: "trial" | "ativo" | "inadimplente" | "suspenso" | "cancelado";
  data_proxima_cobranca?: string;
  habilitada: boolean;
  email_operacional: string;
  email_responsavel: string;
  telefone?: string;
  uf_sede: string;
  ecpf_r2_path?: string;
  ecpf_senha_encrypted?: string;
  ecpf_validade?: string;
  alertas_ativos?: Record<string, boolean>;
  asaas_customer_id?: string;
  created_at?: string;
  updated_at?: string;
}

export class CompaniesRepository {
  private supabase = createSupabaseAdmin();

  async getAll(filters?: { habilitada?: boolean; billing_status?: string; plano?: string }) {
    let query = this.supabase.from("companies").select("*");

    if (filters?.habilitada !== undefined) query = query.eq("habilitada", filters.habilitada);
    if (filters?.billing_status) query = query.eq("billing_status", filters.billing_status);
    if (filters?.plano) query = query.eq("plano", filters.plano);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to get companies: ${error.message}`);
    return (data ?? []) as CompanyRecord[];
  }

  async getById(id: string) {
    const { data, error } = await this.supabase
      .from("companies")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw new Error(`Failed to get company: ${error.message}`);
    return data as CompanyRecord;
  }

  async getByIds(ids: string[]) {
    const { data, error } = await this.supabase
      .from("companies")
      .select("*")
      .in("id", ids);
    if (error) throw new Error(`Failed to get companies by ids: ${error.message}`);
    return (data ?? []) as CompanyRecord[];
  }

  async create(company: Omit<CompanyRecord, "id" | "created_at" | "updated_at">) {
    const { data, error } = await this.supabase
      .from("companies")
      .insert(company)
      .select()
      .single();
    if (error) throw new Error(`Failed to create company: ${error.message}`);
    return data as CompanyRecord;
  }

  async update(id: string, updates: Partial<Omit<CompanyRecord, "id" | "created_at" | "updated_at">>) {
    const { data, error } = await this.supabase
      .from("companies")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(`Failed to update company: ${error.message}`);
    return data as CompanyRecord;
  }

  async getByCnpj(cnpj: string) {
    const { data, error } = await this.supabase
      .from("companies")
      .select("*")
      .eq("cnpj", cnpj)
      .single();
    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows found (not an error)
      throw new Error(`Failed to get company by cnpj: ${error.message}`);
    }
    return (data ?? null) as CompanyRecord | null;
  }

  async updateBillingStatus(id: string, status: CompanyRecord["billing_status"]) {
    return this.update(id, { billing_status: status });
  }

  async updateEcpfInfo(id: string, ecpfPath: string, encryptedPassword: string, validadeDate: string) {
    return this.update(id, {
      ecpf_r2_path: ecpfPath,
      ecpf_senha_encrypted: encryptedPassword,
      ecpf_validade: validadeDate,
    });
  }

  async toggleAlert(id: string, alertType: string, enabled: boolean) {
    const company = await this.getById(id);
    const alertas = company.alertas_ativos || {};
    alertas[alertType] = enabled;
    return this.update(id, { alertas_ativos: alertas });
  }
}
