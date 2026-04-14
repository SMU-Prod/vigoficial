import { createSupabaseAdmin } from "@/lib/supabase/server";
import { addEmailSendJob } from "@/lib/queue/jobs";
import { env } from "@/lib/config/env"; // OPS-02: Use validated env
import type { BillingProvider as _BillingProvider } from "@/lib/billing/types";
import { notifyBillingOverdue, notifySystem } from "@/lib/services/notification-service";
import { renovarContrato, verificarVencimentosContrato } from "@/lib/services/contract-service";

/**
 * Asaas billing provider implementation.
 * Satisfies BillingProvider interface, allowing future provider swapping.
 *
 * Public methods:
 * - criarCliente (implements createCustomer)
 * - gerarCobranca (implements createSubscription)
 * - billingDiario (billing cycle orchestrator)
 *
 * See @/lib/billing/types for the abstract interface.
 */

const ASAAS_URL = env.ASAAS_SANDBOX === "true"
  ? "https://sandbox.asaas.com/api/v3"
  : "https://api.asaas.com/v3";

const ASAAS_KEY = env.ASAAS_API_KEY;

// Timezone do billing — São Paulo (UTC-3)
const BILLING_TZ = "America/Sao_Paulo";

/**
 * Retorna a data atual em São Paulo no formato YYYY-MM-DD
 */
function hojeEmSP(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: BILLING_TZ });
}

/**
 * Retorna a data atual como Date ajustada para o início do dia em SP
 */
function nowInSP(): Date {
  const spStr = new Date().toLocaleString("en-US", { timeZone: BILLING_TZ });
  return new Date(spStr);
}

async function asaasFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${ASAAS_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "access_token": ASAAS_KEY,
      ...options?.headers,
    },
  });
  return res.json();
}

/**
 * Cria cliente no Asaas
 */
export async function criarCliente(company: {
  cnpj: string;
  razao_social: string;
  email_responsavel: string;
}) {
  return asaasFetch("/customers", {
    method: "POST",
    body: JSON.stringify({
      name: company.razao_social,
      cpfCnpj: company.cnpj,
      email: company.email_responsavel,
    }),
  });
}

/**
 * Gera cobrança PIX/Boleto com idempotency key.
 * A chave é composta por customerId + data de vencimento, garantindo
 * que NÃO haverá cobrança duplicada para o mesmo cliente no mesmo dia.
 */
export async function gerarCobranca(
  asaasCustomerId: string,
  valor: number,
  vencimento: string,
  descricao: string
) {
  // Idempotency key: hash determinístico para evitar cobranças duplicadas
  const idempotencyKey = `vigi_billing_${asaasCustomerId}_${vencimento}`;

  return asaasFetch("/payments", {
    method: "POST",
    headers: {
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      customer: asaasCustomerId,
      billingType: "UNDEFINED", // Aceita PIX + Boleto
      value: valor,
      dueDate: vencimento,
      description: descricao,
      externalReference: idempotencyKey, // Referência para queries
    }),
  });
}

/**
 * Ciclo diário de billing
 * PRD Seção 4.2 — Ciclo D-10 a D+30
 */
export async function billingDiario() {
  const supabase = createSupabaseAdmin();
  // Timezone-aware: usa horário de São Paulo para cálculo de dias
  const hoje = nowInSP();
  const hojeStr = hojeEmSP();

  // Busca todas as empresas habilitadas
  const { data: companies } = await supabase
    .from("companies")
    .select("*")
    .eq("habilitada", true);

  if (!companies) return { processed: 0 };

  let processed = 0;

  for (const company of companies) {
    if (!company.data_proxima_cobranca) continue;

    // Parse da data de cobrança como data local (sem timezone shift)
    const [ano, mes, dia] = company.data_proxima_cobranca.split("-").map(Number);
    const cobranca = new Date(ano, mes - 1, dia);
    const diffMs = cobranca.getTime() - new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
    const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));

    // D-10: Template D — aviso de renovação
    if (diffDias === 10) {
      await enviarTemplateD(company);
    }

    // D-5: Segundo lembrete
    if (diffDias === 5) {
      await enviarTemplateD(company);
    }

    // D-0: Gera cobrança Asaas
    if (diffDias === 0) {
      if (company.asaas_customer_id) {
        // Idempotency check: verifica se já existe cobrança para hoje
        const { data: existing } = await supabase
          .from("billing_history")
          .select("id")
          .eq("company_id", company.id)
          .eq("data_vencimento", hojeStr)
          .limit(1);

        if (existing && existing.length > 0) {
          // Cobrança já existe para hoje — pula (idempotent)
          processed++;
          continue;
        }

        const proximoMes = new Date(cobranca);
        proximoMes.setDate(proximoMes.getDate() + 30);

        await gerarCobranca(
          company.asaas_customer_id,
          company.valor_mensal,
          hojeStr,
          `VIG PRO ${company.plano} — ${company.razao_social}`
        );

        // Registra no billing_history
        await supabase.from("billing_history").insert({
          company_id: company.id,
          valor: company.valor_mensal,
          status: "pendente",
          data_vencimento: hojeStr,
        });

        // Atualiza próxima cobrança
        const proximoStr = `${proximoMes.getFullYear()}-${String(proximoMes.getMonth() + 1).padStart(2, "0")}-${String(proximoMes.getDate()).padStart(2, "0")}`;
        await supabase
          .from("companies")
          .update({ data_proxima_cobranca: proximoStr })
          .eq("id", company.id);

        // Renova contrato automaticamente após cobrança
        await renovarContrato(company.id);
      }
    }

    // D+5: Inadimplente
    if (diffDias === -5 && company.billing_status === "ativo") {
      await supabase
        .from("companies")
        .update({ billing_status: "inadimplente" })
        .eq("id", company.id);

      await supabase.from("system_events").insert({
        tipo: "billing_inadimplente",
        severidade: "warning",
        mensagem: `${company.razao_social} marcada como inadimplente`,
        company_id: company.id,
      });

      notifyBillingOverdue(company.razao_social, "Pendente", 5, company.id).catch(() => {});
    }

    // D+15: Suspenso — para operações GESP
    if (diffDias === -15 && company.billing_status === "inadimplente") {
      await supabase
        .from("companies")
        .update({ billing_status: "suspenso" })
        .eq("id", company.id);

      await supabase.from("system_events").insert({
        tipo: "billing_suspenso",
        severidade: "error",
        mensagem: `${company.razao_social} suspensa — operações GESP paradas`,
        company_id: company.id,
      });

      notifySystem(`Empresa suspensa: ${company.razao_social}`, "Operações GESP paradas — cobrança em atraso há 15 dias", "danger").catch(() => {});
    }

    // D+30: Cancelado
    if (diffDias === -30 && company.billing_status === "suspenso") {
      await supabase
        .from("companies")
        .update({ billing_status: "cancelado", habilitada: false })
        .eq("id", company.id);

      await supabase.from("system_events").insert({
        tipo: "billing_cancelado",
        severidade: "critical",
        mensagem: `${company.razao_social} cancelada — acesso bloqueado`,
        company_id: company.id,
      });

      notifySystem(`Empresa cancelada: ${company.razao_social}`, "Acesso bloqueado — cobrança em atraso há 30 dias", "danger").catch(() => {});
    }

    processed++;
  }

  // Verificar vencimentos de contrato e enviar alertas
  const contratoResult = await verificarVencimentosContrato();

  return { processed, contrato_alertas: contratoResult.alertas };
}

async function enviarTemplateD(company: { id: string; razao_social: string; email_responsavel: string; email_operacional: string; valor_mensal: number; data_proxima_cobranca: string }) {
  const supabase = createSupabaseAdmin();

  // Busca métricas do mês para resumo
  const { data: resumo } = await supabase
    .from("vw_billing_resumo")
    .select("*")
    .eq("company_id", company.id)
    .single();

  await addEmailSendJob({
    companyId: company.id,
    templateId: "D",
    mode: "CLIENTE_HTML",
    to: company.email_responsavel,
    subject: `[VIG PRO] Renovação ${new Date(company.data_proxima_cobranca + "T12:00:00").toLocaleDateString("pt-BR", { timeZone: BILLING_TZ })} — Resumo do mês`,
    payload: {
      razaoSocial: company.razao_social,
      emailEmpresa: company.email_operacional,
      dataRenovacao: new Date(company.data_proxima_cobranca + "T12:00:00").toLocaleDateString("pt-BR", { timeZone: BILLING_TZ }),
      valorMensal: `R$ ${company.valor_mensal.toFixed(2).replace(".", ",")}`,
      vigilantesMonitorados: resumo?.vigilantes_ativos || 0,
      renovacoesCnv: 0,
      divergenciasResolvidas: resumo?.divergencias_resolvidas_mes || 0,
      alertasEnviados: 0,
      postosCadastrados: 0,
      transportesExecutados: 0,
      armasProcessadas: 0,
      alertasManutencao: 0,
    },
  });
}
