import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { verifyAsaasWebhook } from "@/lib/webhooks/signature";
import { addEmailSendJob } from "@/lib/queue/jobs";
import { env } from "@/lib/config/env"; // OPS-02
import { notifyBillingPaid } from "@/lib/services/notification-service";

/**
 * POST /api/webhooks/asaas — Webhook de pagamento Asaas
 * PRD Seção 4.4 — Habilitação automática via pagamento
 *
 * FIX: SEG-03 - Webhook signature verification with timing-safe comparison
 */
export async function POST(request: NextRequest) {
  try {
    // Signature verification (optional if not configured for backward compatibility)
    const webhookSecret = env.ASAAS_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature =
        request.headers.get("asaas-access-token") || request.headers.get("x-asaas-signature");

      if (!signature) {
        console.error("[ASAAS-WEBHOOK] Missing webhook signature");
        return NextResponse.json({ error: "Missing signature" }, { status: 401 });
      }

      // Get raw body for signature verification
      const rawBody = await request.text();

      const isValid = await verifyAsaasWebhook(rawBody, signature, webhookSecret);
      if (!isValid) {
        console.error("[ASAAS-WEBHOOK] Invalid webhook signature");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }

      // Parse JSON after verification
      const body = JSON.parse(rawBody);
      return await handleAsaasWebhook(body, request);
    } else {
      // No signature configured — backward compatibility mode
      console.warn("[ASAAS-WEBHOOK] ASAAS_WEBHOOK_SECRET not configured. Running without signature verification.");
      const body = await request.json();
      return await handleAsaasWebhook(body, request);
    }
  } catch (err) {
    console.error("[ASAAS WEBHOOK]", err);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}

/**
 * Handle the validated Asaas webhook payload
 */
async function handleAsaasWebhook(body: unknown, request: NextRequest) {
  try {
    // Rate limiting (webhooks can have higher limits)
    const limitResult = await rateLimit(request, rateLimitConfig.webhook);
    const limitResponse = createRateLimitResponse(limitResult);
    if (limitResponse) return limitResponse;

    const { event, payment } = body as {
      event: string;
      payment: { id: string; customer: string; billingType: string; value: number; [key: string]: unknown };
    };

    if (!event || !payment) {
      return NextResponse.json({ error: "Missing event or payment" }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();

    switch (event) {
      case "PAYMENT_CONFIRMED":
      case "PAYMENT_RECEIVED": {
        // Busca empresa pelo asaas_customer_id
        const { data: company } = await supabase
          .from("companies")
          .select("id, habilitada, billing_status, razao_social, email_operacional, email_responsavel")
          .eq("asaas_customer_id", payment.customer)
          .single();

        if (!company) break;

        // Atualiza billing_history
        await supabase
          .from("billing_history")
          .update({
            status: "pago",
            asaas_payment_id: payment.id,
            metodo_pagamento: payment.billingType,
            data_pagamento: new Date().toISOString(),
          })
          .eq("company_id", company.id)
          .eq("status", "pendente")
          .order("created_at", { ascending: false })
          .limit(1);

        // Notification: payment received
        notifyBillingPaid(
          company.razao_social || "Empresa",
          `R$ ${(payment.value || 0).toFixed(2)}`,
          company.id
        ).catch(() => {});

        // Reativa empresa se estava inadimplente/suspensa
        if (company.billing_status !== "ativo") {
          await supabase
            .from("companies")
            .update({
              billing_status: "ativo",
              habilitada: true,
            })
            .eq("id", company.id);
        }

        // Se primeira cobrança → habilita automaticamente (PRD 4.4)
        if (!company.habilitada) {
          const proximaCobranca = new Date();
          proximaCobranca.setDate(proximaCobranca.getDate() + 30);

          await supabase
            .from("companies")
            .update({
              habilitada: true,
              billing_status: "ativo",
              data_proxima_cobranca: proximaCobranca.toISOString().split("T")[0],
            })
            .eq("id", company.id);

          // Dispatch welcome email (Template A) via queue
          try {
            await addEmailSendJob({
              companyId: company.id,
              templateId: "A",
              mode: "CLIENTE_HTML",
              to: company.email_responsavel || company.email_operacional,
              subject: "Bem-vindo ao VigiPRO",
              payload: {
                razao_social: company.razao_social,
              },
            });
          } catch (err) {
            console.error(`[ASAAS-WEBHOOK] Erro ao disparar Template A para empresa ${company.id}:`, err);
          }
        }

        await supabase.from("system_events").insert({
          tipo: "pagamento_confirmado",
          severidade: "info",
          mensagem: `Pagamento confirmado: ${payment.value}`,
          company_id: company.id,
          detalhes: { payment_id: payment.id, value: payment.value },
        });

        break;
      }

      case "PAYMENT_OVERDUE": {
        const { data: company } = await supabase
          .from("companies")
          .select("id")
          .eq("asaas_customer_id", payment.customer)
          .single();

        if (company) {
          await supabase
            .from("billing_history")
            .update({ status: "atrasado" })
            .eq("company_id", company.id)
            .eq("asaas_payment_id", payment.id);
        }
        break;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[ASAAS WEBHOOK]", err);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
