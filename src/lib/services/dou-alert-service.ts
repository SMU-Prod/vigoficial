import { createSupabaseAdmin } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/sender";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AlertaComDetalhes {
  id: string;
  alvara_id: string;
  publicacao_id: string;
  company_id: string | null;
  prospect_id: string | null;
  cnpj: string;
  tipo_alerta: string;
  titulo: string;
  mensagem: string;
  prioridade: string;
  status: string;
  canal: string | null;
}

interface AlvaraDetalhes {
  id: string;
  razao_social: string;
  cnpj: string;
  cnpj_limpo: string;
  tipo_alvara: string;
  subtipo: string | null;
  numero_processo: string | null;
  delegacia: string | null;
  itens_liberados: Array<{
    quantidade: number;
    descricao: string;
    tipo: string;
    calibre?: string;
  }>;
  validade_dias: number | null;
  data_validade: string | null;
}

interface PublicacaoDetalhes {
  id: string;
  data_publicacao: string;
  url_publicacao: string | null;
  assinante: string | null;
}

/**
 * Serviço de envio de alertas DOU
 * Envia emails para empresas/prospects quando seus alvarás são publicados
 */
export class DouAlertService {
  /**
   * Processa e envia todos os alertas pendentes
   */
  static async processarAlertasPendentes(): Promise<{
    enviados: number;
    falhas: number;
    semEmail: number;
    detalhes: Array<{ alertaId: string; status: string; motivo?: string }>;
  }> {
    const supabase = createSupabaseAdmin();
    let enviados = 0;
    let falhas = 0;
    let semEmail = 0;
    const detalhes: Array<{ alertaId: string; status: string; motivo?: string }> = [];

    // Buscar alertas pendentes
    const { data: alertas, error } = await supabase
      .from("dou_alertas")
      .select("*")
      .eq("status", "pendente")
      .order("created_at", { ascending: true })
      .limit(100);

    if (error || !alertas || alertas.length === 0) {
      return { enviados: 0, falhas: 0, semEmail: 0, detalhes: [] };
    }

    for (const alerta of alertas as AlertaComDetalhes[]) {
      try {
        // Buscar detalhes do alvará
        const { data: alvara } = await supabase
          .from("dou_alvaras")
          .select("*")
          .eq("id", alerta.alvara_id)
          .single();

        // Buscar detalhes da publicação
        const { data: publicacao } = await supabase
          .from("dou_publicacoes")
          .select("id, data_publicacao, url_publicacao, assinante")
          .eq("id", alerta.publicacao_id)
          .single();

        if (!alvara || !publicacao) {
          detalhes.push({ alertaId: alerta.id, status: "falha", motivo: "Alvará ou publicação não encontrados" });
          falhas++;
          continue;
        }

        // Buscar email do destinatário
        const emailDestinatario = await buscarEmailDestinatario(
          supabase,
          alerta.company_id,
          alerta.prospect_id,
          alerta.cnpj
        );

        if (!emailDestinatario) {
          // Sem email — marcar como pendente mas registrar
          semEmail++;
          detalhes.push({ alertaId: alerta.id, status: "sem_email", motivo: "Email não encontrado para CNPJ " + alerta.cnpj });
          continue;
        }

        // Montar payload do email
        const alvaraTyped = alvara as AlvaraDetalhes;
        const pubTyped = publicacao as PublicacaoDetalhes;

        const dataPub = new Date(pubTyped.data_publicacao);
        const dataFormatada = format(dataPub, "dd/MM/yyyy", { locale: ptBR });

        const dataValidadeFormatada = alvaraTyped.data_validade
          ? format(new Date(alvaraTyped.data_validade), "dd/MM/yyyy", { locale: ptBR })
          : undefined;

        const cnpjFormatado = formatarCnpj(alvaraTyped.cnpj_limpo || alvaraTyped.cnpj);

        const tipoLabel: Record<string, string> = {
          autorizacao: "Autorização Concedida",
          renovacao: "Renovação Publicada",
          cancelamento: "Cancelamento Publicado",
          revisao: "Revisão Publicada",
          transferencia: "Transferência Publicada",
        };

        // Mapear tipo_alvara do banco para o código do template de email
        const tipoParaTemplate: Record<string, string> = {
          autorizacao: "CONCEDER",
          renovacao: "RENOVAR",
          cancelamento: "CANCELAR",
          revisao: "DECLARAR",
          transferencia: "CONCEDER",
        };

        const subject = `${tipoLabel[alvaraTyped.tipo_alvara] || "Publicação DOU"} — ${alvaraTyped.razao_social}`;

        // Enviar email via sender existente
        await sendEmail({
          companyId: alerta.company_id || "",
          templateId: "H",
          mode: "CLIENTE_HTML",
          to: emailDestinatario,
          subject,
          payload: {
            razaoSocial: alvaraTyped.razao_social,
            cnpj: cnpjFormatado,
            tipoAlvara: tipoParaTemplate[alvaraTyped.tipo_alvara] || "CONCEDER",
            subtipo: alvaraTyped.subtipo,
            dataPublicacao: dataFormatada,
            itensLiberados: alvaraTyped.itens_liberados || [],
            validadeDias: alvaraTyped.validade_dias,
            dataValidade: dataValidadeFormatada,
            numeroProcesso: alvaraTyped.numero_processo,
            delegacia: alvaraTyped.delegacia,
            urlDou: pubTyped.url_publicacao || undefined,
            assinante: pubTyped.assinante,
          },
        });

        // Marcar alerta como enviado
        await supabase
          .from("dou_alertas")
          .update({
            status: "enviado",
            canal: "email",
            enviado_em: new Date().toISOString(),
          })
          .eq("id", alerta.id);

        enviados++;
        detalhes.push({ alertaId: alerta.id, status: "enviado" });
      } catch (err) {
        // Marcar como falha
        await supabase
          .from("dou_alertas")
          .update({
            status: "falha",
          })
          .eq("id", alerta.id);

        falhas++;
        detalhes.push({
          alertaId: alerta.id,
          status: "falha",
          motivo: err instanceof Error ? err.message : "Erro desconhecido",
        });
      }
    }

    return { enviados, falhas, semEmail, detalhes };
  }

  /**
   * Envia alerta individual por ID
   */
  static async enviarAlerta(alertaId: string): Promise<{ success: boolean; motivo?: string }> {
    const resultado = await this.processarAlertasPendentes();
    const detalhe = resultado.detalhes.find((d) => d.alertaId === alertaId);
    if (detalhe) {
      return { success: detalhe.status === "enviado", motivo: detalhe.motivo };
    }
    return { success: false, motivo: "Alerta não encontrado ou não está pendente" };
  }

  /**
   * Resumo dos alertas para o dashboard
   */
  static async getResumoAlertas(): Promise<{
    pendentes: number;
    enviadosHoje: number;
    falhasHoje: number;
    semEmail: number;
  }> {
    const supabase = createSupabaseAdmin();
    const hoje = new Date().toISOString().split("T")[0];

    const [pendentes, enviadosHoje, falhasHoje, semEmailResult] = await Promise.all([
      supabase.from("dou_alertas").select("id", { count: "exact", head: true }).eq("status", "pendente"),
      supabase
        .from("dou_alertas")
        .select("id", { count: "exact", head: true })
        .eq("status", "enviado")
        .gte("enviado_em", hoje),
      supabase
        .from("dou_alertas")
        .select("id", { count: "exact", head: true })
        .eq("status", "falha")
        .gte("created_at", hoje),
      supabase
        .from("dou_alertas")
        .select("id", { count: "exact", head: true })
        .is("canal", null)
        .eq("status", "pendente"),
    ]);

    return {
      pendentes: pendentes.count || 0,
      enviadosHoje: enviadosHoje.count || 0,
      falhasHoje: falhasHoje.count || 0,
      semEmail: semEmailResult.count || 0,
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Busca email do destinatário na order: company > prospect > prospect pelo CNPJ
 */
async function buscarEmailDestinatario(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  companyId: string | null,
  prospectId: string | null,
  cnpj: string
): Promise<string | null> {
  // 1. Se tem company_id, buscar email da empresa
  if (companyId) {
    const { data: company } = await supabase
      .from("companies")
      .select("email_operacional, email_contato")
      .eq("id", companyId)
      .single();

    if (company) {
      return company.email_operacional || company.email_contato || null;
    }
  }

  // 2. Se tem prospect_id, buscar email do prospect
  if (prospectId) {
    const { data: prospect } = await supabase
      .from("prospects")
      .select("email, email_contato")
      .eq("id", prospectId)
      .single();

    if (prospect) {
      return prospect.email || prospect.email_contato || null;
    }
  }

  // 3. Buscar por CNPJ diretamente nas empresas
  const cnpjLimpo = cnpj.replace(/\D/g, "");
  const { data: companyByCnpj } = await supabase
    .from("companies")
    .select("email_operacional, email_contato")
    .eq("cnpj", cnpjLimpo)
    .limit(1)
    .maybeSingle();

  if (companyByCnpj) {
    return companyByCnpj.email_operacional || companyByCnpj.email_contato || null;
  }

  // 4. Buscar por CNPJ nos prospects
  const { data: prospectByCnpj } = await supabase
    .from("prospects")
    .select("email, email_contato")
    .eq("cnpj", cnpjLimpo)
    .limit(1)
    .maybeSingle();

  if (prospectByCnpj) {
    return prospectByCnpj.email || prospectByCnpj.email_contato || null;
  }

  return null;
}

/**
 * Formata CNPJ: 00000000000000 → 00.000.000/0000-00
 */
function formatarCnpj(cnpj: string): string {
  const limpo = cnpj.replace(/\D/g, "");
  if (limpo.length !== 14) return cnpj;
  return `${limpo.slice(0, 2)}.${limpo.slice(2, 5)}.${limpo.slice(5, 8)}/${limpo.slice(8, 12)}-${limpo.slice(12)}`;
}
