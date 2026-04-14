import { NextRequest, NextResponse } from "next/server";
import { extractSvixHeaders, verifyResendWebhook as verifySvixSignature, isWebhookProcessed, markWebhookProcessed } from "@/lib/webhooks/verify";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { env } from "@/lib/config/env";
import { notifySystem } from "@/lib/services/notification-service";

interface ResendEventData {
  type:
    | "email.delivered"
    | "email.bounced"
    | "email.opened"
    | "email.clicked"
    | "email.failed"
    | "email.complained"
    | "email.delivery_delayed"
    | "email.sent";
  created_at: string;
  data: {
    email_id: string;
    from_addr: string;
    to_addr: string;
    created_at: string;
    reason?: string;
    bounce_type?: "permanent" | "temporary";
    [key: string]: unknown;
  };
}

/**
 * POST /api/webhooks/resend/events — Delivery tracking
 * Atualiza status de email_outbound baseado em eventos Resend
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
    const event: ResendEventData = JSON.parse(rawBody);
    const svixId = headers["svix-id"];
    const data = event.data;

    // Verifica idempotência
    if (await isWebhookProcessed(svixId)) {
      return NextResponse.json({ ok: true });
    }

    const supabase = createSupabaseAdmin();

    // Busca email_outbound pelo resend_id (email_id)
    const { data: outbound } = await supabase
      .from("email_outbound")
      .select("id, company_id, to_email, template_id")
      .eq("resend_id", data.email_id)
      .single();

    if (!outbound) {
      // Email não encontrado, marca como processado mesmo assim
      await markWebhookProcessed(svixId, "/api/webhooks/resend/events");
      return NextResponse.json({ ok: true });
    }

    // Switch por tipo de evento
    switch (event.type) {
      case "email.sent": {
        await supabase
          .from("email_outbound")
          .update({
            status: "enviado",
            sent_at: new Date().toISOString(),
          })
          .eq("id", outbound.id);
        break;
      }

      case "email.delivered": {
        await supabase
          .from("email_outbound")
          .update({
            status: "enviado",
            sent_at: new Date().toISOString(),
          })
          .eq("id", outbound.id);

        // Log evento de sucesso
        await supabase.from("system_events").insert({
          tipo: "email_delivered",
          severidade: "info",
          mensagem: `Email entregue: ${data.to_addr}`,
          company_id: outbound.company_id,
          detalhes: { email_id: data.email_id, to: data.to_addr },
        });
        break;
      }

      case "email.bounced": {
        // Permanent bounce → marca email como inválido
        const isPermanent = data.bounce_type === "permanent";

        await supabase
          .from("email_outbound")
          .update({
            status: "erro",
            erro_detalhe: `Bounced (${data.bounce_type}): ${data.reason || "unknown"}`,
          })
          .eq("id", outbound.id);

        if (isPermanent) {
          // Marca email como inválido em uma tabela de emails inválidos
          // (adicionar se a tabela existir no schema)
          await supabase.from("system_events").insert({
            tipo: "email_bounced_permanent",
            severidade: "aviso",
            mensagem: `Email permanentemente inválido: ${data.to_addr}`,
            company_id: outbound.company_id,
            detalhes: { email: data.to_addr, reason: data.reason },
          });
          notifySystem("Email rejeitado (bounce)", `Destinatário: ${data.to_addr}`, "danger").catch(() => {});
        }
        break;
      }

      case "email.failed": {
        await supabase
          .from("email_outbound")
          .update({
            status: "erro",
            erro_detalhe: data.reason || "Unknown failure",
          })
          .eq("id", outbound.id);

        await supabase.from("system_events").insert({
          tipo: "email_failed",
          severidade: "erro",
          mensagem: `Erro ao enviar email: ${data.to_addr}`,
          company_id: outbound.company_id,
          detalhes: { email_id: data.email_id, reason: data.reason },
        });
        break;
      }

      case "email.opened": {
        await supabase.from("system_events").insert({
          tipo: "email_opened",
          severidade: "info",
          mensagem: `Email aberto: ${data.to_addr}`,
          company_id: outbound.company_id,
          detalhes: { email_id: data.email_id },
        });
        // Loop de feedback: se era email de prospecção, atualiza score do prospect
        if (outbound.template_id === "I") {
          await updateProspectEngagement(supabase, outbound.to_email, "opened");
        }
        break;
      }

      case "email.clicked": {
        await supabase.from("system_events").insert({
          tipo: "email_clicked",
          severidade: "info",
          mensagem: `Link clicado no email: ${data.to_addr}`,
          company_id: outbound.company_id,
          detalhes: { email_id: data.email_id },
        });
        // Loop de feedback: clique = engajamento forte, boost maior
        if (outbound.template_id === "I") {
          await updateProspectEngagement(supabase, outbound.to_email, "clicked");
        }
        break;
      }

      case "email.complained": {
        // Spam complaint → alerta admin
        await supabase
          .from("email_outbound")
          .update({
            status: "erro",
            erro_detalhe: "Marked as spam by recipient",
          })
          .eq("id", outbound.id);

        await supabase.from("system_events").insert({
          tipo: "email_complained",
          severidade: "aviso",
          mensagem: `Email marcado como spam: ${data.to_addr}`,
          company_id: outbound.company_id,
          detalhes: { email_id: data.email_id, to: data.to_addr },
        });
        notifySystem("Email marcado como spam", `Destinatário: ${data.to_addr}`, "danger").catch(() => {});
        break;
      }

      case "email.delivery_delayed": {
        // Apenas registra delay
        await supabase.from("system_events").insert({
          tipo: "email_delivery_delayed",
          severidade: "aviso",
          mensagem: `Entrega atrasada: ${data.to_addr}`,
          company_id: outbound.company_id,
          detalhes: { email_id: data.email_id, reason: data.reason },
        });
        break;
      }

      default: {
        // Unknown event type
        break;
      }
    }

    // Marca como processado
    await markWebhookProcessed(svixId, "/api/webhooks/resend/events");

    return NextResponse.json({ ok: true });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Tenta registrar erro em system_events
    try {
      const supabase = createSupabaseAdmin();
      await supabase.from("system_events").insert({
        tipo: "webhook_events_erro",
        severidade: "erro",
        mensagem: `Erro no webhook de eventos: ${errorMessage}`,
        detalhes: { error: errorMessage },
      });
    } catch {
      // Silenciosamente falha se não conseguir registrar
    }

    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ─── Loop de Feedback: Prospect Engagement ───────────────────────────────────

/**
 * Atualiza score do prospect quando ele interage com email de prospecção.
 *
 * LÓGICA DE BOOST:
 *   opened  → +5 pts (sinal fraco: pode ser curiosidade)
 *   clicked → +15 pts (sinal forte: visitou o link do relatório)
 *
 * Regras:
 *   - Score máximo 100
 *   - Temperatura: se cruzar limiar 55+, promove para "quente"
 *   - Status "perdido" ou "ganho" → não altera (pipeline já fechado)
 *   - Cria entrada em prospect_activities para rastreamento
 */
async function updateProspectEngagement(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  toEmail: string,
  eventType: "opened" | "clicked"
): Promise<void> {
  if (!toEmail) return;

  try {
    // Localiza prospect pelo email de destino
    const { data: prospect } = await supabase
      .from("prospects")
      .select("id, score, temperatura, status, razao_social")
      .or(`email.eq.${toEmail},email_contato.eq.${toEmail}`)
      .not("status", "in", '("ganho","perdido")')
      .maybeSingle();

    if (!prospect) return;

    const scoreDelta = eventType === "clicked" ? 15 : 5;
    const novoScore = Math.min(100, (prospect.score ?? 0) + scoreDelta);

    // Recalcula temperatura com novo score
    let novaTemp = prospect.temperatura;
    if (novoScore >= 55 && prospect.temperatura === "morno") novaTemp = "quente";
    if (novoScore >= 30 && prospect.temperatura === "frio") novaTemp = "morno";

    // Atualiza prospect
    await supabase
      .from("prospects")
      .update({
        score: novoScore,
        temperatura: novaTemp,
        updated_at: new Date().toISOString(),
      })
      .eq("id", prospect.id);

    // Registra atividade no histórico do prospect
    const descricao = eventType === "clicked"
      ? `[Email] Prospect clicou no link do relatório regulatório (+15 pts → score ${novoScore})`
      : `[Email] Prospect abriu o email de prospecção (+5 pts → score ${novoScore})`;

    await supabase.from("prospect_activities").insert({
      prospect_id: prospect.id,
      tipo: "email_engagement",
      descricao,
      realizado_por: "webhook_resend",
    });

    // Se temperatura mudou, log adicional
    if (novaTemp !== prospect.temperatura) {
      await supabase.from("prospect_activities").insert({
        prospect_id: prospect.id,
        tipo: "nota",
        descricao: `[Auto] Temperatura promovida de ${prospect.temperatura} → ${novaTemp} após ${eventType === "clicked" ? "clique no link" : "abertura de email"}`,
        realizado_por: "webhook_resend",
      });
    }
  } catch {
    // Não propaga erro — feedback loop não deve quebrar o webhook principal
  }
}
