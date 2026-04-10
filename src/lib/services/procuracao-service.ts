import { createSupabaseAdmin } from "@/lib/supabase/server";
import { addEmailSendJob } from "@/lib/queue/jobs";

export type ProcuracaoStatus =
  | "pendente"
  | "instrucoes_enviadas"
  | "cliente_confirmou"
  | "validada"
  | "rejeitada"
  | "revogada"
  | "expirada";

export interface Procuracao {
  id: string;
  company_id: string;
  cpf_procurador: string;
  nome_procurador: string;
  poderes: "plenos" | "limitados";
  poderes_descricao: string | null;
  status: ProcuracaoStatus;
  instrucoes_enviadas_at: string | null;
  cliente_confirmou_at: string | null;
  validada_at: string | null;
  validada_por: string | null;
  rejeitada_at: string | null;
  motivo_rejeicao: string | null;
  revogada_at: string | null;
  comprovante_r2_path: string | null;
  prazo_limite: string | null;
  lembrete_enviado: boolean;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyWithProcuracao {
  razao_social: string;
  cnpj: string;
  procuracao: Procuracao;
}

export class ProcuracaoService {
  private static supabase = createSupabaseAdmin();

  /**
   * Inicia o fluxo de procuração para uma empresa recém-convertida.
   * Cria o registro e envia o email de instruções (Template O).
   */
  static async iniciarFluxo(params: {
    companyId: string;
    cpfProcurador: string;
    nomeProcurador: string;
    poderes?: "plenos" | "limitados";
  }): Promise<Procuracao> {
    const {
      companyId,
      cpfProcurador,
      nomeProcurador,
      poderes = "plenos",
    } = params;

    // 1. Check if company exists
    const { data: company, error: companyError } = await this.supabase
      .from("companies")
      .select("id, razao_social, email_contato")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      throw new Error(`Empresa não encontrada: ${companyId}`);
    }

    // 2. Check if there's already an active procuracao for this company
    const { data: existingProcuracao } = await this.supabase
      .from("procuracoes")
      .select("id")
      .eq("company_id", companyId)
      .in("status", ["pendente", "instrucoes_enviadas", "cliente_confirmou"])
      .single();

    if (existingProcuracao) {
      throw new Error(
        "Já existe uma procuração ativa para esta empresa"
      );
    }

    // 3. Calculate prazo_limite (7 days from now)
    const hoje = new Date();
    const prazolimite = new Date(hoje.getTime() + 7 * 24 * 60 * 60 * 1000);
    const prazoLimiteIso = prazolimite.toISOString().split("T")[0];

    // 4. Create procuracao record with status 'pendente'
    const { data: procuracao, error: createError } = await this.supabase
      .from("procuracoes")
      .insert({
        company_id: companyId,
        cpf_procurador: cpfProcurador,
        nome_procurador: nomeProcurador,
        poderes,
        status: "pendente",
        prazo_limite: prazoLimiteIso,
        lembrete_enviado: false,
      })
      .select()
      .single();

    if (createError || !procuracao) {
      throw new Error(`Erro ao criar procuração: ${createError?.message}`);
    }

    // 5. Queue email Template O with instructions
    // Template O is the instructions email for procuration flow
    await addEmailSendJob({
      companyId,
      templateId: "OF-A", // Using OF-A as placeholder for procuration instructions
      mode: "CLIENTE_HTML",
      to: company.email_contato,
      subject: "Instruções de Procuração",
      payload: {
        nomeProcurador,
        cpfProcurador,
        prazolimite: prazoLimiteIso,
      },
    });

    // 6. Update procuracao status to 'instrucoes_enviadas'
    const { data: updatedProcuracao, error: updateError } = await this.supabase
      .from("procuracoes")
      .update({
        status: "instrucoes_enviadas",
        instrucoes_enviadas_at: new Date().toISOString(),
      })
      .eq("id", procuracao.id)
      .select()
      .single();

    if (updateError) {
      throw new Error(
        `Erro ao atualizar status: ${updateError.message}`
      );
    }

    // 7. Return the procuracao
    return updatedProcuracao as Procuracao;
  }

  /**
   * Cliente confirma que cadastrou a procuração no GESP
   */
  static async confirmarCliente(procuracaoId: string): Promise<Procuracao> {
    const { data: procuracao, error } = await this.supabase
      .from("procuracoes")
      .update({
        status: "cliente_confirmou",
        cliente_confirmou_at: new Date().toISOString(),
      })
      .eq("id", procuracaoId)
      .select()
      .single();

    if (error || !procuracao) {
      throw new Error(
        `Erro ao confirmar procuração: ${error?.message}`
      );
    }

    return procuracao as Procuracao;
  }

  /**
   * Operador VIGI valida que a procuração existe no GESP
   * This also sets company.habilitada = true and company.procuracao_status = 'validada'
   */
  static async validar(params: {
    procuracaoId: string;
    validadoPor: string; // user ID
    comprovanteR2Path?: string;
  }): Promise<Procuracao> {
    const { procuracaoId, validadoPor, comprovanteR2Path } = params;

    // Get procuracao to access company_id
    const { data: procuracao, error: fetchError } = await this.supabase
      .from("procuracoes")
      .select("company_id")
      .eq("id", procuracaoId)
      .single();

    if (fetchError || !procuracao) {
      throw new Error(`Procuração não encontrada: ${procuracaoId}`);
    }

    const companyId = procuracao.company_id;

    // 1. Update procuracao status to 'validada'
    const { data: updatedProcuracao, error: procError } = await this.supabase
      .from("procuracoes")
      .update({
        status: "validada",
        validada_at: new Date().toISOString(),
        validada_por: validadoPor,
        comprovante_r2_path: comprovanteR2Path || null,
      })
      .eq("id", procuracaoId)
      .select()
      .single();

    if (procError || !updatedProcuracao) {
      throw new Error(`Erro ao validar procuração: ${procError?.message}`);
    }

    // 2. Update company: habilitada = true, procuracao_status = 'validada'
    const { error: companyError } = await this.supabase
      .from("companies")
      .update({
        habilitada: true,
        procuracao_status: "validada",
      })
      .eq("id", companyId);

    if (companyError) {
      throw new Error(
        `Erro ao atualizar status da empresa: ${companyError.message}`
      );
    }

    // 3. Send welcome email (Template A) - now the company is truly active
    // Fetch company email_contato for the welcome email
    const { data: company } = await this.supabase
      .from("companies")
      .select("email_contato")
      .eq("id", companyId)
      .single();

    if (company?.email_contato) {
      await addEmailSendJob({
        companyId,
        templateId: "A", // Template A is the welcome email
        mode: "CLIENTE_HTML",
        to: company.email_contato,
        subject: "Bem-vindo",
        payload: {},
      });
    }

    return updatedProcuracao as Procuracao;
  }

  /**
   * Rejeitar procuração (não encontrada no GESP)
   */
  static async rejeitar(params: {
    procuracaoId: string;
    motivo: string;
  }): Promise<Procuracao> {
    const { procuracaoId, motivo } = params;

    const { data: procuracao, error } = await this.supabase
      .from("procuracoes")
      .update({
        status: "rejeitada",
        rejeitada_at: new Date().toISOString(),
        motivo_rejeicao: motivo,
      })
      .eq("id", procuracaoId)
      .select()
      .single();

    if (error || !procuracao) {
      throw new Error(`Erro ao rejeitar procuração: ${error?.message}`);
    }

    return procuracao as Procuracao;
  }

  /**
   * Busca procuração por company_id (ativa = não rejeitada/revogada/expirada)
   */
  static async getByCompany(companyId: string): Promise<Procuracao | null> {
    const { data: procuracao } = await this.supabase
      .from("procuracoes")
      .select("*")
      .eq("company_id", companyId)
      .not("status", "in", '("rejeitada","revogada","expirada")')
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    return procuracao as Procuracao | null;
  }

  /**
   * Lista todas as procurações pendentes de validação (para painel operador)
   */
  static async getPendentesValidacao(): Promise<
    (Procuracao & { razao_social: string; cnpj: string })[]
  > {
    const { data: procuracoes, error } = await this.supabase
      .from("procuracoes")
      .select(
        `
        *,
        companies!inner(razao_social, cnpj)
      `
      )
      .in("status", ["pendente", "instrucoes_enviadas", "cliente_confirmou"])
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(
        `Erro ao buscar procurações pendentes: ${error.message}`
      );
    }

    // Flatten the companies data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (procuracoes || []).map((p: any) => ({
      ...p,
      razao_social: p.companies.razao_social,
      cnpj: p.companies.cnpj,
    }));
  }

  /**
   * Enviar lembrete para empresas que não confirmaram dentro do prazo
   */
  static async enviarLembretes(): Promise<number> {
    const hoje = new Date().toISOString().split("T")[0];

    // Find procuracoes where prazo_limite <= today and lembrete_enviado = false
    // and status in ('pendente', 'instrucoes_enviadas')
    const { data: procuracoes, error: fetchError } = await this.supabase
      .from("procuracoes")
      .select("*")
      .lte("prazo_limite", hoje)
      .eq("lembrete_enviado", false)
      .in("status", ["pendente", "instrucoes_enviadas"]);

    if (fetchError) {
      throw new Error(
        `Erro ao buscar procurações com vencimento: ${fetchError.message}`
      );
    }

    let count = 0;

    for (const procuracao of procuracoes || []) {
      try {
        // Fetch company email_contato for reminder
        const { data: company } = await this.supabase
          .from("companies")
          .select("email_contato")
          .eq("id", procuracao.company_id)
          .single();

        if (!company?.email_contato) {
          console.warn(`[PROCURACAO] No email_contato for company ${procuracao.company_id}, skipping reminder`);
          continue;
        }

        // Send reminder email
        await addEmailSendJob({
          companyId: procuracao.company_id,
          templateId: "OF-B", // Using OF-B as placeholder for reminder email
          mode: "CLIENTE_HTML",
          to: company.email_contato,
          subject: "Lembrete de Procuração",
          payload: {
            nomeProcurador: procuracao.nome_procurador,
            prazoLimite: procuracao.prazo_limite,
          },
        });

        // Mark lembrete_enviado = true
        await this.supabase
          .from("procuracoes")
          .update({ lembrete_enviado: true })
          .eq("id", procuracao.id);

        count++;
      } catch (err) {
        console.error(
          `[PROCURACAO] Erro ao enviar lembrete para ${procuracao.id}:`,
          err
        );
      }
    }

    return count;
  }
}
