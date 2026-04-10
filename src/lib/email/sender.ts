import { Resend } from "resend";
import { env } from "@/lib/config/env"; // OPS-02
import { render } from "@react-email/components";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import type { EmailTemplateId, EmailMode } from "@/types/database";
import { EMAIL_FROM_DEFAULT, EMAIL_FROM_ATENDIMENTO, EMAIL_ATENDIMENTO, INTERNAL_ONLY_EMAILS } from "@/lib/config/constants";
import { buildReplyRecipients } from "@/lib/email/threading";
import { notifyEmailSent, notifyEmailError } from "@/lib/services/notification-service";

// Templates React Email
import TemplateA from "../../../emails/template-a-boas-vindas";
import TemplateB from "../../../emails/template-b-confirmacao";
import TemplateC from "../../../emails/template-c-alerta-validade";
import TemplateD from "../../../emails/template-d-renovacao";
import TemplateE from "../../../emails/template-e-caso-desconhecido";
import TemplateF from "../../../emails/template-f-urgencia";
import TemplateG from "../../../emails/template-g-alerta-frota";
import TemplateH from "../../../emails/template-h-alerta-dou";
import TemplateI from "../../../emails/template-i-prospeccao-dou";
import TemplateJ from "../../../emails/template-j-relatorio-mensal";
import TemplateK from "../../../emails/template-k-billing";
import TemplateL from "../../../emails/template-l-reset-senha";
import TemplateM from "../../../emails/template-m-sistema";
import TemplateN from "../../../emails/template-n-convite";
import TemplateO from "../../../emails/template-o-procuracao";

// Lazy init: só cria o client Resend quando realmente precisar enviar email
// Evita crash em rotas que importam este módulo indiretamente (ex: /api/dou/scrape)
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(env.RESEND_API_KEY);
  }
  return _resend;
}

interface SendEmailParams {
  companyId: string;
  templateId: EmailTemplateId;
  mode: EmailMode;
  to: string;
  subject: string;
  payload: Record<string, unknown>;
  fromEmail?: string;
  workflowId?: string;
  gespTaskId?: string;
  // Threading support
  threadId?: string;
  cc?: string[];
  replyTo?: string;
  inReplyTo?: string;
  references?: string[];
  idempotencyKey?: string;
}

/**
 * Envia email via Resend e registra em email_outbound
 * PRD Regra R11: CLIENTE_HTML = HTML visual VIGI, OFICIO_PF = plain text
 */
export async function sendEmail(params: SendEmailParams) {
  const supabase = createSupabaseAdmin();

  let bodyHtml: string | null = null;
  let bodyText: string | null = null;
  let fromEmail = params.fromEmail || EMAIL_FROM_DEFAULT;

  if (params.mode === "CLIENTE_HTML") {
    // Renderiza template React Email para HTML
    bodyHtml = await renderTemplate(params.templateId, params.payload);
  } else {
    // OFICIO_PF: plain text, remetente = email da empresa (Regra R11)
    bodyText = params.payload.bodyText as string;

    // Buscar email da empresa para remetente
    if (params.companyId) {
      const { data: company } = await supabase
        .from("companies")
        .select("email_operacional")
        .eq("id", params.companyId)
        .single();
      if (company) fromEmail = company.email_operacional;
    }
  }

  // Salva em email_outbound ANTES de enviar
  const { data: outbound, error: insertError } = await supabase
    .from("email_outbound")
    .insert({
      company_id: params.companyId,
      template_id: params.templateId,
      mode: params.mode,
      from_email: fromEmail,
      to_email: params.to,
      subject: params.subject,
      body_html: bodyHtml,
      body_text: bodyText,
      workflow_id: params.workflowId || null,
      gesp_task_id: params.gespTaskId || null,
      thread_id: params.threadId || null,
      cc_emails: params.cc || null,
      status: "pendente",
    })
    .select()
    .single();

  if (insertError || !outbound) {
    throw new Error(`Erro ao salvar email_outbound: ${insertError?.message}`);
  }

  // Envia via Resend
  try {
    const from = `VIG PRO <${fromEmail}>`;

    // ══════ EMAIL REDIRECT (test mode) ══════
    // Se EMAIL_REDIRECT_TO estiver configurado, TODOS os emails são redirecionados
    // para o endereço de teste. O destinatário original é preservado no subject.
    const redirectTo = env.EMAIL_REDIRECT_TO;
    const to = redirectTo ? [redirectTo] : [params.to];

    if (redirectTo) {
      params.subject = `[REDIRECT de: ${params.to}] ${params.subject}`;
      // Remove CC em modo teste para não enviar para terceiros
      params.cc = undefined;
      console.log(`[EMAIL-REDIRECT] Email para ${params.to} redirecionado para ${redirectTo}`);
    }

    const resend = getResend();

    // Build email options with proper typing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emailOptions: any = {
      from,
      to,
      subject: params.subject,
    };

    // Add HTML or text body
    if (bodyHtml) {
      emailOptions.html = bodyHtml;
    } else {
      emailOptions.text = bodyText || "";
    }

    // Add threading support if provided
    if (params.cc && params.cc.length > 0) {
      emailOptions.cc = params.cc;
    }

    const replyTo = params.replyTo || EMAIL_ATENDIMENTO;
    emailOptions.reply_to = replyTo;

    // Custom headers for email threading
    const headers: Record<string, string> = {};
    if (params.inReplyTo) {
      headers["In-Reply-To"] = params.inReplyTo;
    }
    if (params.references && params.references.length > 0) {
      headers["References"] = params.references.join(" ");
    }
    if (Object.keys(headers).length > 0) {
      emailOptions.headers = headers;
    }

    // Tags for tracking and threading
    if (params.threadId || params.companyId) {
      const tags: { name: string; value: string }[] = [];
      if (params.threadId) {
        tags.push({ name: "thread_id", value: params.threadId });
      }
      if (params.companyId) {
        tags.push({ name: "company_id", value: params.companyId });
      }
      emailOptions.tags = tags;
    }

    // Idempotency key for duplicate prevention
    if (params.idempotencyKey) {
      emailOptions.idempotencyKey = params.idempotencyKey;
    }

    const result = await resend.emails.send(emailOptions);

    // Atualiza status para enviado
    await supabase
      .from("email_outbound")
      .update({
        resend_id: result.data?.id || null,
        status: "enviado",
        sent_at: new Date().toISOString(),
      })
      .eq("id", outbound.id);

    // Notify: email sent successfully
    notifyEmailSent("system", params.to, params.subject, params.companyId).catch(() => {});

    return { success: true, outboundId: outbound.id, resendId: result.data?.id };
  } catch (err) {
    // Registra erro
    await supabase
      .from("email_outbound")
      .update({
        status: "erro",
        erro_detalhe: err instanceof Error ? err.message : "Erro desconhecido",
      })
      .eq("id", outbound.id);

    // Notify: email send failed
    const errMsg = err instanceof Error ? err.message : "Erro desconhecido";
    notifyEmailError(params.to, params.subject, errMsg, params.companyId).catch(() => {});

    throw err;
  }
}

/**
 * Envia resposta em uma thread de email
 * Recupera participantes ativos da thread e configura headers de threading
 */
export async function sendThreadReply(params: {
  threadId: string;
  companyId: string;
  templateId: EmailTemplateId;
  subject: string;
  payload: Record<string, unknown>;
  workflowId?: string;
}): Promise<{ success: boolean; outboundId: string; resendId?: string }> {
  const supabase = createSupabaseAdmin();

  // Get active participants from the thread
  const { data: threadData, error: threadError } = await supabase
    .from("email_threads")
    .select("id, message_ids, last_message_id")
    .eq("id", params.threadId)
    .single();

  if (threadError || !threadData) {
    throw new Error(`Erro ao buscar thread ${params.threadId}: ${threadError?.message}`);
  }

  // Build reply recipients (CC with active participants)
  const replyInfo = await buildReplyRecipients(params.threadId);

  // Prepare subject (add "Re:" if not already present)
  let finalSubject = params.subject;
  if (!finalSubject.startsWith("Re:")) {
    finalSubject = `Re: ${finalSubject}`;
  }

  // Filter out internal-only emails from CC
  const cc = replyInfo.cc.filter(
    (email) => !INTERNAL_ONLY_EMAILS.includes(email)
  );

  // Send email with threading support
  return sendEmail({
    companyId: params.companyId,
    templateId: params.templateId,
    mode: "CLIENTE_HTML",
    to: replyInfo.to,
    subject: finalSubject,
    payload: params.payload,
    fromEmail: EMAIL_FROM_ATENDIMENTO,
    workflowId: params.workflowId,
    threadId: params.threadId,
    cc,
    replyTo: EMAIL_ATENDIMENTO,
    inReplyTo: threadData.last_message_id || undefined,
    references: threadData.message_ids || [],
  });
}

/**
 * Renderiza template React Email para HTML string
 */
async function renderTemplate(
  templateId: EmailTemplateId,
  payload: Record<string, unknown>
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = payload as any;

  switch (templateId) {
    case "A":
      return render(TemplateA(p));
    case "B":
      return render(TemplateB(p));
    case "C":
      return render(TemplateC(p));
    case "D":
      return render(TemplateD(p));
    case "E":
      return render(TemplateE(p));
    case "F":
      return render(TemplateF(p));
    case "G":
      return render(TemplateG(p));
    case "H":
      return render(TemplateH(p));
    case "I":
      return render(TemplateI(p));
    case "J":
      return render(TemplateJ(p));
    case "K":
      return render(TemplateK(p));
    case "L":
      return render(TemplateL(p));
    case "M":
      return render(TemplateM(p));
    case "N":
      return render(TemplateN(p));
    case "O":
      return render(TemplateO(p));
    default:
      throw new Error(`Template ${templateId} não suportado para HTML`);
  }
}
