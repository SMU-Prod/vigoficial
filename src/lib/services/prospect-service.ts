import { createSupabaseAdmin } from "@/lib/supabase/server";
import type { Prospect, ProspectActivity, LeadStatus, LeadTemperatura, LeadSegmento, LeadSource } from "@/types/database";

type ProspectInsert = Omit<Prospect, "id" | "created_at" | "updated_at">;
type ProspectUpdate = Partial<Omit<ProspectInsert, "cnpj">>;

export interface ProspectFilters {
  status?: LeadStatus;
  temperatura?: LeadTemperatura;
  segmento?: LeadSegmento;
  source?: LeadSource;
  uf?: string;
  search?: string;
  hasEmail?: boolean;
  hasPhone?: boolean;
  followupVencido?: boolean;
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDir?: "asc" | "desc";
}

export interface ProspectStats {
  total: number;
  por_status: Record<string, number>;
  por_temperatura: Record<string, number>;
  por_uf: Record<string, number>;
  por_source: Record<string, number>;
  com_email: number;
  com_telefone: number;
  valor_pipeline: number;
  followups_pendentes: number;
  dou_total: number;
  dou_com_alvara: number;
}

/**
 * Service layer para operações de prospecção/CRM
 */
export class ProspectService {
  private static supabase = createSupabaseAdmin();

  /**
   * Lista prospects com filtros avançados
   */
  static async getAll(filters: ProspectFilters = {}): Promise<{ data: Prospect[]; count: number }> {
    try {
      const {
        status, temperatura, segmento, source, uf,
        search, hasEmail, hasPhone, followupVencido,
        limit = 50, offset = 0,
        orderBy = "created_at", orderDir = "desc",
      } = filters;

      let query = this.supabase
        .from("prospects")
        .select("*", { count: "exact" });

      if (status) query = query.eq("status", status);
      if (temperatura) query = query.eq("temperatura", temperatura);
      if (segmento) query = query.eq("segmento", segmento);
      if (source) query = query.eq("source", source);
      if (uf) query = query.eq("uf", uf);

      if (search) {
        query = query.or(
          `razao_social.ilike.%${search}%,cnpj.ilike.%${search}%,nome_fantasia.ilike.%${search}%,municipio.ilike.%${search}%`
        );
      }

      if (hasEmail) query = query.not("email", "is", null);
      if (hasPhone) query = query.not("telefone1", "is", null);

      if (followupVencido) {
        const hoje = new Date().toISOString().split("T")[0];
        query = query
          .not("proximo_followup", "is", null)
          .lte("proximo_followup", hoje)
          .not("status", "in", '("ganho","perdido")');
      }

      const { data, error, count } = await query
        .order(orderBy, { ascending: orderDir === "asc" })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new Error(`Failed to get prospects: ${error.message}`);
      }

      return { data: data || [], count: count || 0 };
    } catch (error) {
      console.error("[ProspectService] getAll error:", error);
      throw error;
    }
  }

  /**
   * Busca prospect por ID
   */
  static async getById(id: string): Promise<Prospect | null> {
    try {
      const { data, error } = await this.supabase
        .from("prospects")
        .select("*")
        .eq("id", id)
        .single();

      if (error && error.code !== "PGRST116") {
        throw new Error(`Failed to get prospect: ${error.message}`);
      }

      return data || null;
    } catch (error) {
      console.error("[ProspectService] getById error:", error);
      throw error;
    }
  }

  /**
   * Cria novo prospect
   */
  static async create(data: ProspectInsert): Promise<Prospect> {
    try {
      // Calcula score automaticamente
      const score = this.calculateScore(data);

      const { data: prospect, error } = await this.supabase
        .from("prospects")
        .insert({ ...data, score })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create prospect: ${error.message}`);
      }

      return prospect;
    } catch (error) {
      console.error("[ProspectService] create error:", error);
      throw error;
    }
  }

  /**
   * Atualiza prospect
   */
  static async update(id: string, data: ProspectUpdate): Promise<Prospect> {
    try {
      const { data: prospect, error } = await this.supabase
        .from("prospects")
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update prospect: ${error.message}`);
      }

      return prospect;
    } catch (error) {
      console.error("[ProspectService] update error:", error);
      throw error;
    }
  }

  /**
   * Avança status no pipeline
   */
  static async advanceStatus(id: string, novoStatus: LeadStatus): Promise<Prospect> {
    try {
      const updateData: ProspectUpdate = {
        status: novoStatus,
        ultimo_contato: new Date().toISOString(),
      };

      // Ajusta temperatura baseado no status
      if (novoStatus === "qualificado" || novoStatus === "proposta_enviada") {
        updateData.temperatura = "morno";
      } else if (novoStatus === "negociacao") {
        updateData.temperatura = "quente";
      } else if (novoStatus === "ganho") {
        updateData.temperatura = "quente";
        updateData.data_conversao = new Date().toISOString();
      }

      return this.update(id, updateData);
    } catch (error) {
      console.error("[ProspectService] advanceStatus error:", error);
      throw error;
    }
  }

  /**
   * Converte prospect em empresa (Company)
   */
  static async convertToCompany(
    id: string,
    plano: string,
    valorMensal: number
  ): Promise<{ prospect: Prospect; companyId: string }> {
    try {
      const prospect = await this.getById(id);
      if (!prospect) throw new Error("Prospect não encontrado");

      // Cria a empresa na tabela companies
      // Empresa criada com habilitada=false até procuração eletrônica ser validada.
      // Fluxo: convertToCompany → iniciarFluxoProcuracao → cliente cadastra no GESP
      //        → operador valida → habilitada=true → GESP sync liberado
      const { data: company, error: companyError } = await this.supabase
        .from("companies")
        .insert({
          cnpj: prospect.cnpj,
          razao_social: prospect.razao_social,
          nome_fantasia: prospect.nome_fantasia || prospect.razao_social,
          email_operacional: prospect.contato_email || prospect.email || "",
          email_responsavel: prospect.contato_email || prospect.email || "",
          telefone: prospect.telefone1,
          uf_sede: prospect.uf || "SP",
          plano,
          valor_mensal: valorMensal,
          billing_status: "trial",
          habilitada: false,
          procuracao_status: "nao_iniciada",
          alertas_ativos: {},
        })
        .select()
        .single();

      if (companyError) {
        throw new Error(`Failed to create company: ${companyError.message}`);
      }

      // Atualiza prospect como ganho
      const updatedProspect = await this.update(id, {
        status: "ganho",
        temperatura: "quente",
        data_conversao: new Date().toISOString(),
        company_id: company.id,
        plano_interesse: plano,
        valor_estimado: valorMensal,
      });

      return { prospect: updatedProspect, companyId: company.id };
    } catch (error) {
      console.error("[ProspectService] convertToCompany error:", error);
      throw error;
    }
  }

  /**
   * Estatísticas do pipeline de prospecção
   */
  static async getStats(): Promise<ProspectStats> {
    try {
      const hoje = new Date().toISOString().split("T")[0];

      // Consultas paralelas usando count/head para evitar carregar 34k+ registros
      const [
        { count: total },
        { count: com_email },
        { count: com_telefone },
        { count: followups_pendentes },
        { count: dou_total },
        { count: dou_com_alvara },
        { data: statusRows },
        { data: tempRows },
        { data: ufRows },
        { data: sourceRows },
        { data: valorRows },
      ] = await Promise.all([
        // Total
        this.supabase.from("prospects").select("id", { count: "exact", head: true }),
        // Com email
        this.supabase.from("prospects").select("id", { count: "exact", head: true }).not("email", "is", null),
        // Com telefone
        this.supabase.from("prospects").select("id", { count: "exact", head: true }).not("telefone1", "is", null),
        // Followups vencidos
        this.supabase.from("prospects").select("id", { count: "exact", head: true })
          .not("proximo_followup", "is", null)
          .lte("proximo_followup", hoje)
          .not("status", "in", '("ganho","perdido")'),
        // DOU total
        this.supabase.from("prospects").select("id", { count: "exact", head: true }).eq("source", "dou"),
        // DOU com alvará vinculado
        this.supabase.from("dou_alvaras").select("prospect_id", { count: "exact", head: true }).not("prospect_id", "is", null),
        // Agrupamento por status (apenas 6-7 valores possíveis)
        this.supabase.from("prospects").select("status"),
        // Agrupamento por temperatura (apenas 3 valores)
        this.supabase.from("prospects").select("temperatura"),
        // Agrupamento por UF (27 estados)
        this.supabase.from("prospects").select("uf").not("uf", "is", null),
        // Agrupamento por source
        this.supabase.from("prospects").select("source"),
        // Valor pipeline (apenas prospects ativos com valor)
        this.supabase.from("prospects").select("valor_estimado")
          .not("valor_estimado", "is", null)
          .not("status", "in", '("ganho","perdido")'),
      ]);

      // Agregar status
      const por_status: Record<string, number> = {};
      for (const r of statusRows || []) {
        por_status[r.status] = (por_status[r.status] || 0) + 1;
      }

      // Agregar temperatura
      const por_temperatura: Record<string, number> = {};
      for (const r of tempRows || []) {
        por_temperatura[r.temperatura] = (por_temperatura[r.temperatura] || 0) + 1;
      }

      // Agregar UF
      const por_uf: Record<string, number> = {};
      for (const r of ufRows || []) {
        if (r.uf) por_uf[r.uf] = (por_uf[r.uf] || 0) + 1;
      }

      // Agregar source
      const por_source: Record<string, number> = {};
      for (const r of sourceRows || []) {
        por_source[r.source] = (por_source[r.source] || 0) + 1;
      }

      // Somar valor pipeline
      let valor_pipeline = 0;
      for (const r of valorRows || []) {
        valor_pipeline += r.valor_estimado || 0;
      }

      return {
        total: total || 0,
        por_status,
        por_temperatura,
        por_uf,
        por_source,
        com_email: com_email || 0,
        com_telefone: com_telefone || 0,
        valor_pipeline,
        followups_pendentes: followups_pendentes || 0,
        dou_total: dou_total || 0,
        dou_com_alvara: dou_com_alvara || 0,
      };
    } catch (error) {
      console.error("[ProspectService] getStats error:", error);
      throw error;
    }
  }

  /**
   * Registra atividade de um prospect
   */
  static async addActivity(data: {
    prospect_id: string;
    user_id: string;
    tipo: ProspectActivity["tipo"];
    descricao: string;
    resultado?: string;
  }): Promise<ProspectActivity> {
    try {
      const { data: activity, error } = await this.supabase
        .from("prospect_activities")
        .insert(data)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to add activity: ${error.message}`);
      }

      // Atualiza ultimo_contato no prospect
      await this.supabase
        .from("prospects")
        .update({ ultimo_contato: new Date().toISOString() })
        .eq("id", data.prospect_id);

      return activity;
    } catch (error) {
      console.error("[ProspectService] addActivity error:", error);
      throw error;
    }
  }

  /**
   * Lista atividades de um prospect
   */
  static async getActivities(prospectId: string): Promise<ProspectActivity[]> {
    try {
      const { data, error } = await this.supabase
        .from("prospect_activities")
        .select("*")
        .eq("prospect_id", prospectId)
        .order("created_at", { ascending: false });

      if (error) throw new Error(`Failed to get activities: ${error.message}`);

      return data || [];
    } catch (error) {
      console.error("[ProspectService] getActivities error:", error);
      throw error;
    }
  }

  /**
   * Importação em lote de prospects a partir do CSV da RFB
   */
  static async bulkImport(
    prospects: Omit<ProspectInsert, "status" | "source" | "temperatura" | "score" | "tags">[],
    importadoPor: string
  ): Promise<{ imported: number; duplicates: number; errors: number }> {
    try {
      let imported = 0;
      let duplicates = 0;
      let errors = 0;

      // Processa em batches de 100
      const batchSize = 100;
      for (let i = 0; i < prospects.length; i += batchSize) {
        const batch = prospects.slice(i, i + batchSize);

        const rows = batch.map((p) => ({
          ...p,
          cnpj: p.cnpj.replace(/\D/g, ""),
          status: "novo" as const,
          source: "csv_rfb" as const,
          temperatura: "frio" as const,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          score: this.calculateScore(p as any),
          tags: [],
          importado_por: importadoPor,
        }));

        const { data, error } = await this.supabase
          .from("prospects")
          .upsert(rows, { onConflict: "cnpj", ignoreDuplicates: true })
          .select("id");

        if (error) {
          console.error(`[ProspectService] Batch ${i / batchSize} error:`, error.message);
          errors += batch.length;
        } else {
          imported += (data || []).length;
          duplicates += batch.length - (data || []).length;
        }
      }

      return { imported, duplicates, errors };
    } catch (error) {
      console.error("[ProspectService] bulkImport error:", error);
      throw error;
    }
  }

  /**
   * Calcula score de lead (0-100) baseado em dados disponíveis
   */
  private static calculateScore(data: Partial<ProspectInsert>): number {
    let score = 0;

    // CNAE principal de vigilância = +30 pontos
    if (data.cnae_principal === "8011101") score += 30;
    // CNAE de monitoramento ou outras atividades de segurança = +20
    else if (data.cnae_principal?.startsWith("801") || data.cnae_principal?.startsWith("802")) score += 20;

    // Tem email = +15 pontos
    if (data.email) score += 15;

    // Tem telefone = +10 pontos
    if (data.telefone1) score += 10;

    // Capital social indica tamanho/capacidade de pagamento
    if (data.capital_social) {
      if (data.capital_social >= 1000000) score += 20; // Grande
      else if (data.capital_social >= 200000) score += 15; // Média
      else if (data.capital_social >= 50000) score += 10; // Pequena
      else score += 5; // Micro
    }

    // Empresa mais recente = provavelmente mais digital/aberta
    if (data.data_abertura) {
      const year = parseInt(data.data_abertura.split("/").pop() || "0");
      if (year >= 2020) score += 10;
      else if (year >= 2010) score += 5;
    }

    // UF com maior mercado = oportunidade
    const ufsPrioritarias = ["SP", "RJ", "MG", "PR", "RS", "BA", "DF"];
    if (data.uf && ufsPrioritarias.includes(data.uf)) score += 5;

    // Contato comercial = +10 pontos
    if (data.contato_nome) score += 5;
    if (data.contato_email) score += 5;

    return Math.min(100, score);
  }

  /**
   * Verifica se CNPJ já existe como prospect ou empresa
   */
  static async checkCnpjExists(cnpj: string): Promise<{ asProspect: boolean; asCompany: boolean }> {
    const cleanCnpj = cnpj.replace(/\D/g, "");

    const [prospectCheck, companyCheck] = await Promise.all([
      this.supabase.from("prospects").select("id").eq("cnpj", cleanCnpj).single(),
      this.supabase.from("companies").select("id").eq("cnpj", cleanCnpj).single(),
    ]);

    return {
      asProspect: !!prospectCheck.data,
      asCompany: !!companyCheck.data,
    };
  }
}
