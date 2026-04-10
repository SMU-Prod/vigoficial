import { NextRequest, NextResponse } from "next/server";
import { extractSvixHeaders, verifyResendWebhook as verifySvixSignature, isWebhookProcessed, markWebhookProcessed } from "@/lib/webhooks/verify";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { getEmailReadQueue } from "@/lib/queue/queues";
import { isProspectReply } from "@/lib/agents/prospect-reply";
import { env } from "@/lib/config/env";
import { notifyEmailReceived } from "@/lib/services/notification-service";

const DOMAIN = "vigconsultoria.com";
const ATENDIMENTO = `atendimento@${DOMAIN}`;
const VIGIPRO = `vigipro@${DOMAIN}`;

interface ResendInboundEvent {
  type: "email.inbound";
  created_at: string;
  data: {
    from_addr: string;
    to_addr: string;
    reply_to?: string;
    subject: string;
    html?: string;
    text: string;
    message_id: string;
  };
}

/**
 * POST /api/webhooks/resend/inbound — Email router
 * Processa emails recebidos em @vigconsultoria.com
 * Regra R2: Salva IMEDIATAMENTE em email_inbound
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const limitResult = await rateLimit(request, rateLimitConfig.webhook);
    const limitResponse = createRateLimitResponse(limitResult);
    if (limitResponse) return limitResponse;

    // Extrai headers Svix
    const headers = extractSvixHeaders(request);

    // Lê body como texto (CRITICO para verificação Svix)
    const rawBody = await request.text();

    // Verifica assinatura (optional if secret not configured)
    if (env.RESEND_WEBHOOK_SECRET) {
      try {
        verifySvixSignature(rawBody, headers);
      } catch (_err) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    // Parse JSON após verificação
    const event: ResendInboundEvent = JSON.parse(rawBody);

    if (event.type !== "email.inbound") {
      return NextResponse.json({ error: "Invalid event type" }, { status: 400 });
    }

    const svixId = headers["svix-id"];
    const data = event.data;

    // Verifica idempotência
    if (await isWebhookProcessed(svixId)) {
      return NextResponse.json({ ok: true });
    }

    const supabase = createSupabaseAdmin();

    // Regra R2: Salva IMEDIATAMENTE em email_inbound
    const { data: inbound, error: insertError } = await supabase
      .from("email_inbound")
      .insert({
        gmail_message_id: data.message_id,
        from_email: data.from_addr,
        to_email: data.to_addr,
        subject: data.subject,
        body_text: data.text,
        body_html: data.html || null,
        received_at: new Date().toISOString(),
        status: "recebido",
        company_id: null,
        parser_resultado: null,
        tipo_demanda: null,
        confidence_score: null,
        workflow_id: null,
      })
      .select()
      .single();

    if (insertError || !inbound) {
      return NextResponse.json(
        { error: "Database error" },
        { status: 500 }
      );
    }

    // Notify email received
    notifyEmailReceived(data.from_addr, data.subject, undefined, undefined).catch(() => {});

    // Marca como processado
    await markWebhookProcessed(svixId, "/api/webhooks/resend/inbound");

    // Enqueue heavy processing (< 5s)
    const emailQueue = getEmailReadQueue();

    // ── Detecção de reply de prospecção (Template I) ──────────────────────────
    // Se o assunto começa com "Re:" e contém nosso padrão de outreach,
    // é uma resposta de prospect. Despacha para classificação especializada.
    if (isProspectReply(data.subject)) {
      await emailQueue.add(
        "inbound.prospect_reply",
        {
          inboundId: inbound.id,
          fromEmail: data.from_addr,
          subject: data.subject,
          bodyText: data.text,
          bodyHtml: data.html,
        },
        { attempts: 3, backoff: { type: "exponential", delay: 3000 } }
      );
      return NextResponse.json({ ok: true });
    }
    // ─────────────────────────────────────────────────────────────────────────

    const toAddr = data.to_addr.toLowerCase();

    if (toAddr === ATENDIMENTO) {
      // Cliente → atendimento: roteador completo
      await emailQueue.add(
        "inbound.cliente",
        {
          inboundId: inbound.id,
          fromEmail: data.from_addr,
          subject: data.subject,
          bodyText: data.text,
          bodyHtml: data.html,
        },
        { attempts: 3, backoff: { type: "exponential", delay: 2000 } }
      );
    } else if (toAddr === VIGIPRO) {
      // Admin confirmation (só se from admin@)
      if (data.from_addr.toLowerCase().endsWith("@vigconsultoria.com")) {
        await emailQueue.add(
          "inbound.admin-confirmation",
          {
            inboundId: inbound.id,
            fromEmail: data.from_addr,
            subject: data.subject,
            bodyText: data.text,
          },
          { attempts: 2, backoff: { type: "exponential", delay: 2000 } }
        );
      }
    } else if (toAddr.endsWith(`@${DOMAIN}`)) {
      // User email (usuario@vigconsultoria.com)
      const usuario = toAddr.split("@")[0];
      await emailQueue.add(
        "inbound.user",
        {
          inboundId: inbound.id,
          usuario,
          fromEmail: data.from_addr,
          subject: data.subject,
          bodyText: data.text,
          bodyHtml: data.html,
        },
        { attempts: 3, backoff: { type: "exponential", delay: 2000 } }
      );
    } else {
      // Unknown recipient
      await emailQueue.add(
        "inbound.unknown",
        {
          inboundId: inbound.id,
          toEmail: data.to_addr,
          fromEmail: data.from_addr,
          subject: data.subject,
        },
        { attempts: 1 }
      );
    }

    // Retorna 200 imediatamente (processamento é async)
    return NextResponse.json({ ok: true });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Registra erro em system_events se soubermos o contexto
    try {
      const supabase = createSupabaseAdmin();
      await supabase.from("system_events").insert({
        tipo: "webhook_inbound_erro",
        severidade: "erro",
        mensagem: `Erro no webhook de inbound: ${errorMessage}`,
        detalhes: { error: errorMessage },
      });
    } catch {
      // Silenciosamente falha se não conseguir registrar
    }

    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
