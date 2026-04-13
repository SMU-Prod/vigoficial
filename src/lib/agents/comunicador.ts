/**
 * VIGI — Agente Comunicador
 * PRD Seção 3.6 (Emails) + 3.8 (Ofícios)
 *
 * Responsabilidades:
 * - Processar fila de envio de emails com priorização
 * - Enviar emails HTML brandados (CLIENTE_HTML)
 * - Enviar ofícios plain text (OFICIO_PF) — Portaria 18.045/23-DG/PF
 * - Gerar e enviar alertas de conformidade (Templates C, F, G)
 * - Gerar e enviar alertas DOU (Template H)
 * - Gerar e enviar emails de boas-vindas (Template A)
 * - Rastrear todos os envios e falhas
 *
 * Regras Aplicáveis:
 * - R11: CLIENTE_HTML vs OFICIO_PF (definido por templateId)
 * - R12: Ofícios enviados à DELESP do estado do posto
 * - R13: Priorização (urgente > normal > low)
 */

import { createSupabaseAdmin } from "@/lib/supabase/server";
import {
  startAgentRun,
  completeAgentRun,
  logAgentDecision,
  TokenTracker,
} from "@/lib/agents/base";
import type {
  ComunicadorState,
  EmailToSend,
} from "@/lib/agents/types";
import { addEmailSendJob } from "@/lib/queue/jobs";
import {
  EMAIL_EQUIPE,
  ALERT_THRESHOLDS,
} from "@/lib/config/constants";
import type {
  EmailTemplateId,
} from "@/types/database";

// Lazy init: avoid module-level createClient during Next.js build
let _supabase: ReturnType<typeof createSupabaseAdmin> | null = null;
function getSupabase() {
  if (!_supabase) _supabase = createSupabaseAdmin();
  return _supabase;
}
const supabase = new Proxy({} as ReturnType<typeof createSupabaseAdmin>, {
  get(_target, prop) {
    return (getSupabase() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

// --- Constants ---

const OFICIO_TEMPLATES: Record<string, string> = {
  "OF-A": `
OFÍCIO Nº [NUMERO]/[ANO]/[DELEGACIA]

Brasília, [DATA]

Ao
Serviço de Inteligência da Polícia Federal
[ENDEREÇO DELESP]
Estado: [UF]

Prezados Senhores,

Referente à empresa [RAZAO_SOCIAL], inscrita no CNPJ [CNPJ], comunicamos:

[CONTEUDO]

Atenciosamente,

VIG Consultoria
Sistema de Compliance de Segurança Privada
`,
  "OF-B": `
OFÍCIO Nº [NUMERO]/[ANO]/[DELEGACIA]

Brasília, [DATA]

Ao
Diretor Regional da Delegacia Especial
[ENDEREÇO DELESP]
Estado: [UF]

Prezados Senhores,

Em referência à empresa [RAZAO_SOCIAL], CNPJ [CNPJ]:

[CONTEUDO]

Respeitosamente submetido,

VIG Consultoria
`,
  "OF-C": `
OFÍCIO Nº [NUMERO]/[ANO]/[DELEGACIA]

Brasília, [DATA]

Destinatário: [DESTINATARIO]
Endereço: [ENDERECO]
Estado: [UF]

Assunto: Comunicado de Conformidade - [RAZAO_SOCIAL]

[CONTEUDO]

Atenciosamente,

VIG Consultoria
`,
  "OF-D": `
OFÍCIO Nº [NUMERO]/[ANO]/[DELEGACIA]

Brasília, [DATA]

[CONTEUDO]

VIG Consultoria
`,
  "OF-E": `
OFÍCIO Nº [NUMERO]/[ANO]/[DELEGACIA]

Brasília, [DATA]

[CONTEUDO]

VIG Consultoria
`,
};

// --- Helper: Get DELESP address by state (R12) ---
function getDELESPByState(uf: string): { endereco: string; email: string } {
  const delesp: Record<
    string,
    { endereco: string; email: string }
  > = {
    SP: {
      endereco:
        "Rua Mestre Caetano, 800 - Bom Retiro, São Paulo - SP",
      email: "delesp.sp@pf.gov.br",
    },
    RJ: {
      endereco:
        "Av. Central, 2.800 - Centro, Rio de Janeiro - RJ",
      email: "delesp.rj@pf.gov.br",
    },
    MG: {
      endereco:
        "Rua Ceará, 357 - Funcionários, Belo Horizonte - MG",
      email: "delesp.mg@pf.gov.br",
    },
    BA: {
      endereco:
        "Av. Tancredo Neves, 148 - Federação, Salvador - BA",
      email: "delesp.ba@pf.gov.br",
    },
    RS: {
      endereco:
        "Av. Alberto Bins, 440 - Centro, Porto Alegre - RS",
      email: "delesp.rs@pf.gov.br",
    },
    PR: {
      endereco:
        "Rua Sete de Setembro, 2.700 - Centro, Curitiba - PR",
      email: "delesp.pr@pf.gov.br",
    },
    DF: {
      endereco:
        "SAIS Quadra 1, Bloco C - Plano Piloto, Brasília - DF",
      email: "delesp.df@pf.gov.br",
    },
  };

  return (
    delesp[uf.toUpperCase()] || {
      endereco: "Polícia Federal - Brasília - DF",
      email: EMAIL_EQUIPE,
    }
  );
}

// --- Helper: Get alert template ID by severity ---
function getAlertTemplate(
  daysRemaining: number,
  alertType: "compliance" | "frota" | "dou"
): EmailTemplateId {
  if (alertType === "frota") return "G";
  if (alertType === "dou") return "H";

  // Compliance alerts
  if (daysRemaining <= ALERT_THRESHOLDS.critical) return "F"; // 0-5 dias → crítico
  return "C"; // > 5 dias → genérico
}

// --- Helper: Track token usage (minimal for this agent) ---
function createTokenTracker(): TokenTracker {
  return new TokenTracker("comunicador");
}

// --- Main: Process batch of emails for sending ---
export async function runComunicadorBatch(
  emailsToSend: EmailToSend[]
): Promise<ComunicadorState> {
  const runId = (await startAgentRun(
    "comunicador",
    "manual",
    "batch-send",
    undefined,
    { emailsCount: emailsToSend.length }
  )) as string;

  const state: ComunicadorState = {
    runId,
    agentName: "comunicador",
    triggerType: "manual",
    triggerSource: "batch-send",
    startedAt: new Date().toISOString(),
    steps: [],
    errors: [],
    totalTokens: 0,
    totalCostUsd: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    emailsToSend: emailsToSend,
    emailsSent: 0,
    emailsFailed: 0,
    oficiosGenerated: 0,
    notificationsSent: 0,
  };

  const tokenTracker = createTokenTracker();

  try {
    // Step 1: Sort by priority (R13)
    state.steps.push({
      name: "Sort emails by priority",
      status: "running",
      startedAt: new Date().toISOString(),
    });

    const priorityMap: Record<string, number> = { urgent: 0, normal: 1, low: 2 };
    const sortedEmails = [...emailsToSend].sort(
      (a, b) => (priorityMap[a.priority] || 2) - (priorityMap[b.priority] || 2)
    );

    state.steps[state.steps.length - 1].status = "completed";
    state.steps[state.steps.length - 1].output = {
      sortedCount: sortedEmails.length,
    };

    await logAgentDecision({
      run_id: runId,
      agent_name: "comunicador",
      step_name: "Sort emails by priority",
      decision_type: "action",
      input_summary: `${emailsToSend.length} emails to sort`,
      output_summary: `Sorted ${sortedEmails.length} emails by priority`,
      tokens_input: 0,
      tokens_output: 0,
      escalated_to_human: false,
    });

    // Step 2: Process each email
    state.steps.push({
      name: "Queue emails for sending",
      status: "running",
      startedAt: new Date().toISOString(),
    });

    const successfulQueues: string[] = [];
    const failedQueues: string[] = [];

    for (const email of sortedEmails) {
      try {
        // Validate email data
        if (!email.companyId || !email.to || !email.templateId) {
          throw new Error(
            `Invalid email data: missing companyId, to, or templateId`
          );
        }

        // Queue the email send job
        const jobId = await addEmailSendJob({
          companyId: email.companyId,
          templateId: email.templateId as EmailTemplateId,
          mode: email.mode,
          to: email.to,
          subject: email.subject,
          payload: email.payload,
        });

        successfulQueues.push(jobId.id as string);
        state.emailsSent = (state.emailsSent ?? 0) + 1;
      } catch (error) {
        const errorMsg =
          error instanceof Error
            ? error.message
            : "Unknown error queuing email";
        state.errors.push(errorMsg);
        state.emailsFailed = (state.emailsFailed ?? 0) + 1;
        failedQueues.push(email.to);

        console.error(
          `[COMUNICADOR] Failed to queue email to ${email.to}:`,
          errorMsg
        );
      }
    }

    state.steps[state.steps.length - 1].status = "completed";
    state.steps[state.steps.length - 1].output = {
      successCount: successfulQueues.length,
      failCount: failedQueues.length,
      jobIds: successfulQueues,
    };

    await logAgentDecision({
      run_id: runId,
      agent_name: "comunicador",
      step_name: "Queue emails for sending",
      decision_type: "action",
      input_summary: `${sortedEmails.length} sorted emails`,
      output_summary: `${successfulQueues.length} queued, ${failedQueues.length} failed`,
      tokens_input: 0,
      tokens_output: 0,
      escalated_to_human: failedQueues.length > 0,
    });

    const finalStatus = "completed" as const;

    await completeAgentRun(runId, "comunicador", finalStatus, {
      emailsSent: state.emailsSent,
      emailsFailed: state.emailsFailed,
      officiosGenerated: state.oficiosGenerated,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any, tokenTracker.stats);

    return state;
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Unknown error in batch send";
    state.errors.push(errorMsg as string);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await completeAgentRun(runId, "comunicador", "failed", {} as any, tokenTracker.stats, errorMsg);

    return state;
  }
}

// --- Main: Generate and send compliance alerts ---
export async function runComunicadorAlerts(
  companyId: string
): Promise<ComunicadorState> {
  const runId = (await startAgentRun(
    "comunicador",
    "cron",
    "compliance-alerts",
    companyId,
    { companyId }
  )) as string;

  const state: ComunicadorState = {
    runId,
    agentName: "comunicador",
    companyId,
    triggerType: "cron",
    triggerSource: "compliance-alerts",
    startedAt: new Date().toISOString(),
    steps: [],
    errors: [],
    totalTokens: 0,
    totalCostUsd: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    emailsToSend: [],
    emailsSent: 0,
    emailsFailed: 0,
    oficiosGenerated: 0,
    notificationsSent: 0,
  };

  const tokenTracker = createTokenTracker();

  try {
    // Step 1: Fetch pending compliance alerts
    state.steps.push({
      name: "Fetch compliance alerts",
      status: "running",
      startedAt: new Date().toISOString(),
    });

    const { data: alerts, error: alertsError } = await supabase
      .from("compliance_alerts")
      .select("*")
      .eq("company_id", companyId)
      .eq("alerta_enviado", false)
      .order("dias_restantes", { ascending: true });

    if (alertsError) throw alertsError;

    state.steps[state.steps.length - 1].status = "completed";
    state.steps[state.steps.length - 1].output = { alertsCount: alerts?.length || 0 };

    // Step 2: Fetch pending DOU alerts
    state.steps.push({
      name: "Fetch DOU alerts",
      status: "running",
      startedAt: new Date().toISOString(),
    });

    const { data: douAlerts, error: douError } = await supabase
      .from("dou_alerts")
      .select("*")
      .eq("company_id", companyId)
      .eq("alerta_enviado", false);

    if (douError) throw douError;

    state.steps[state.steps.length - 1].status = "completed";
    state.steps[state.steps.length - 1].output = { douAlertsCount: douAlerts?.length || 0 };

    // Step 3: Get company contact info
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("email_responsavel, email_operacional, uf_sede")
      .eq("id", companyId)
      .single();

    if (companyError || !company) throw new Error(companyError?.message || "Company not found");

    // Step 4: Queue compliance alerts
    state.steps.push({
      name: "Queue compliance alerts",
      status: "running",
      startedAt: new Date().toISOString(),
    });

    if (alerts && alerts.length > 0) {
      for (const alert of alerts) {
        try {
          const templateId = getAlertTemplate(
            alert.dias_restantes,
            "compliance"
          );

          await addEmailSendJob({
            companyId,
            templateId,
            mode: "CLIENTE_HTML",
            to: company.email_responsavel || company.email_operacional,
            subject: `Alerta de Conformidade: ${alert.tipo_alerta}`,
            payload: {
              companyId,
              alertType: alert.tipo_alerta,
              daysRemaining: alert.dias_restantes,
              entityType: alert.tipo_entidade,
              entityId: alert.id_entidade,
              fieldName: alert.campo,
              expirationDate: alert.data_vencimento,
            },
          });

          state.emailsSent = (state.emailsSent ?? 0) + 1;

          // Mark alert as sent
          await supabase
            .from("compliance_alerts")
            .update({
              alerta_enviado: true,
              data_envio_alerta: new Date().toISOString(),
            })
            .eq("id", alert.id);
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : "Unknown error";
          state.errors.push(`Compliance alert ${alert.id}: ${errorMsg}` as string);
          state.emailsFailed = (state.emailsFailed ?? 0) + 1;
        }
      }
    }

    // Step 5: Queue DOU alerts
    if (douAlerts && douAlerts.length > 0) {
      for (const douAlert of douAlerts) {
        try {
          await addEmailSendJob({
            companyId,
            templateId: "H",
            mode: "CLIENTE_HTML",
            to: company.email_responsavel || company.email_operacional,
            subject: `Alerta DOU: ${douAlert.tipo_item}`,
            payload: {
              companyId,
              douDate: douAlert.data_dou,
              itemType: douAlert.tipo_item,
              cnpj: douAlert.cnpj,
              razaoSocial: douAlert.razao_social,
              content: douAlert.conteudo,
            },
          });

          state.emailsSent = (state.emailsSent ?? 0) + 1;

          // Mark DOU alert as sent
          await supabase
            .from("dou_alerts")
            .update({
              alerta_enviado: true,
              data_envio_alerta: new Date().toISOString(),
            })
            .eq("id", douAlert.id);
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : "Unknown error";
          state.errors.push(`DOU alert ${douAlert.id}: ${errorMsg}` as string);
          state.emailsFailed = (state.emailsFailed ?? 0) + 1;
        }
      }
    }

    state.steps[state.steps.length - 1].status = "completed";
    state.steps[state.steps.length - 1].output = {
      complianceAlertsSent: alerts?.length || 0,
      douAlertsSent: douAlerts?.length || 0,
    };

    const finalStatus = "completed" as const;

    await completeAgentRun(runId, "comunicador", finalStatus, {
      alertsSent: state.emailsSent,
      alertsFailed: state.emailsFailed,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any, tokenTracker.stats);

    return state;
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Unknown error in alerts";
    state.errors.push(errorMsg as string);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await completeAgentRun(runId, "comunicador", "failed", {} as any, tokenTracker.stats, errorMsg);

    return state;
  }
}

// --- Main: Generate and send ofício ---
export async function runComunicadorOficio(
  companyId: string,
  oficioType: "OF-A" | "OF-B" | "OF-C" | "OF-D" | "OF-E",
  dados: Record<string, unknown>
): Promise<ComunicadorState> {
  const runId = (await startAgentRun(
    "comunicador",
    "manual",
    `oficio-${oficioType}`,
    companyId,
    { companyId, oficioType, dados }
  )) as string;

  const state: ComunicadorState = {
    runId,
    agentName: "comunicador",
    companyId,
    triggerType: "manual",
    triggerSource: `oficio-${oficioType}`,
    startedAt: new Date().toISOString(),
    steps: [],
    errors: [],
    totalTokens: 0,
    totalCostUsd: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    emailsToSend: [],
    emailsSent: 0,
    emailsFailed: 0,
    oficiosGenerated: 0,
    notificationsSent: 0,
  };

  const tokenTracker = createTokenTracker();

  try {
    // Step 1: Fetch company and determine DELESP (R12)
    state.steps.push({
      name: "Resolve company and DELESP",
      status: "running",
      startedAt: new Date().toISOString(),
    });

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("razao_social, cnpj, uf_sede, email_operacional")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      throw new Error(`Company ${companyId} not found`);
    }

    const delesp = getDELESPByState(company.uf_sede);

    state.steps[state.steps.length - 1].status = "completed";
    state.steps[state.steps.length - 1].output = {
      company: company.razao_social,
      delesp: delesp.endereco,
    };

    // Step 2: Generate ofício text from template
    state.steps.push({
      name: "Generate ofício text",
      status: "running",
      startedAt: new Date().toISOString(),
    });

    const template = OFICIO_TEMPLATES[oficioType];
    if (!template) {
      throw new Error(`Unknown ofício type: ${oficioType}`);
    }

    let oficioText = template;

    // Replace placeholders
    oficioText = oficioText.replace("[NUMERO]", `${Date.now() % 10000}`);
    oficioText = oficioText.replace("[ANO]", new Date().getFullYear().toString());
    oficioText = oficioText.replace(
      "[DELEGACIA]",
      `PF-${company.uf_sede}`
    );
    oficioText = oficioText.replace("[DATA]", new Date().toLocaleDateString("pt-BR"));
    oficioText = oficioText.replace("[RAZAO_SOCIAL]", company.razao_social);
    oficioText = oficioText.replace("[CNPJ]", company.cnpj);
    oficioText = oficioText.replace("[ENDERECO DELESP]", delesp.endereco);
    oficioText = oficioText.replace("[UF]", company.uf_sede);

    // Replace custom fields from dados
    for (const [key, value] of Object.entries(dados)) {
      const placeholder = `[${key.toUpperCase()}]`;
      oficioText = oficioText.replace(placeholder, String(value));
    }

    state.steps[state.steps.length - 1].status = "completed";
    state.steps[state.steps.length - 1].output = {
      templateType: oficioType,
      textLength: oficioText.length,
    };

    // Step 3: Queue send via email-send queue (R11 - OFICIO_PF mode)
    state.steps.push({
      name: "Queue ofício for sending",
      status: "running",
      startedAt: new Date().toISOString(),
    });

    try {
      const jobId = await addEmailSendJob({
        companyId,
        templateId: oficioType as EmailTemplateId,
        mode: "OFICIO_PF",
        to: delesp.email,
        subject: `Ofício ${oficioType} - ${company.razao_social}`,
        payload: {
          oficioType,
          companyId,
          cnpj: company.cnpj,
          razaoSocial: company.razao_social,
          content: oficioText,
          destinatario: delesp.endereco,
        },
      });

      state.emailsSent = (state.emailsSent ?? 0) + 1;
      state.oficiosGenerated = (state.oficiosGenerated ?? 0) + 1;

      state.steps[state.steps.length - 1].status = "completed";
      state.steps[state.steps.length - 1].output = {
        jobId: jobId.id,
        sentTo: delesp.email,
      };

      await completeAgentRun(runId, "comunicador", "completed", {
        oficioType,
        oficiosGenerated: 1,
        jobId: jobId.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any, tokenTracker.stats);
    } catch (queueError) {
      const errorMsg =
        queueError instanceof Error ? queueError.message : "Unknown error";
      state.errors.push(errorMsg as string);
      state.emailsFailed = (state.emailsFailed ?? 0) + 1;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await completeAgentRun(runId, "comunicador", "failed", {} as any, tokenTracker.stats, errorMsg);
    }

    return state;
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Unknown error in ofício generation";
    state.errors.push(errorMsg as string);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await completeAgentRun(runId, "comunicador", "failed", {} as any, tokenTracker.stats, errorMsg);

    return state;
  }
}

// --- Utility: Send welcome email (Template A) ---
export async function sendWelcomeEmail(
  companyId: string,
  to: string,
  companyName: string
): Promise<string> {
  try {
    const jobId = await addEmailSendJob({
      companyId,
      templateId: "A",
      mode: "CLIENTE_HTML",
      to,
      subject: `Bem-vindo ao VIG PRO - ${companyName}`,
      payload: {
        companyId,
        companyName,
        recipientEmail: to,
      },
    });

    return jobId.id as string;
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Unknown error sending welcome email";
    console.error(`[COMUNICADOR] Failed to send welcome email:`, errorMsg);
    throw error;
  }
}

// --- Utility: Send fleet alert (Template G) ---
export async function sendFleetAlert(
  companyId: string,
  to: string,
  vehicleData: Record<string, unknown>
): Promise<string> {
  try {
    const jobId = await addEmailSendJob({
      companyId,
      templateId: "G",
      mode: "CLIENTE_HTML",
      to,
      subject: "Alerta de Manutenção - Frota",
      payload: {
        companyId,
        vehicleData,
      },
    });

    return jobId.id as string;
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Unknown error sending fleet alert";
    console.error(`[COMUNICADOR] Failed to send fleet alert:`, errorMsg);
    throw error;
  }
}
