import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getAuthFromRequest, requireRole, canAccessCompany } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { validateBody } from "@/lib/validation/schemas";
import { addEmailSendJob } from "@/lib/queue/jobs";
import { notifySystem } from "@/lib/services/notification-service";
import { z } from "zod";

const replySchema = z.object({
  body: z.string().min(1),
  templateId: z.string().uuid().optional(),
});

/**
 * POST /api/threads/[id]/reply — Envia resposta em um thread
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Rate limiting
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "operador");
  if (denied) return denied;

  try {
    // Validate body
    const { data: parsed, error: validationError } = await validateBody(
      request,
      replySchema
    );
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();

    // Fetch thread
    const { data: thread, error: threadError } = await supabase
      .from("threads")
      .select("company_id, id")
      .eq("id", id)
      .single();

    if (threadError || !thread) {
      return NextResponse.json(
        { error: "Thread não encontrado" },
        { status: 404 }
      );
    }

    if (!canAccessCompany(auth!, thread.company_id)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    // Get all current participants (recipients for reply-all)
    const { data: participants } = await supabase
      .from("thread_participants")
      .select("user_id")
      .eq("thread_id", id)
      .eq("ativo", true);

    const recipientUserIds = participants?.map((p) => p.user_id) || [];

    // Create outbound email record
    const { data: emailData, error: emailError } = await supabase
      .from("email_outbound")
      .insert({
        thread_id: id,
        from: auth!.userId,
        to: recipientUserIds,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        body: (parsed as any).body,
        subject: `RE: [Thread ${id}]`,
      })
      .select()
      .single();

    if (emailError) {
      return NextResponse.json({ error: emailError.message }, { status: 500 });
    }

    // Add user as participant if not already present
    const isParticipant = recipientUserIds.includes(auth!.userId);
    if (!isParticipant) {
      await supabase.from("thread_participants").insert({
        thread_id: id,
        user_id: auth!.userId,
        ativo: true,
      });
    }

    // Queue email send via BullMQ
    try {
      await addEmailSendJob({
        companyId: thread.company_id,
        templateId: "A",
        mode: "CLIENTE_HTML",
        to: recipientUserIds[0] || "support@vigi.com.br",
        subject: emailData.subject,
        payload: {
          body: (parsed as { body: string }).body,
          thread_id: id,
        },
      });
    } catch (err) {
      console.error("[THREADS-REPLY] Erro ao enfileirar email para envio:", err);
    }

    // Update user_metrics T3 (user intervention count)
    const { data: metrics } = await supabase
      .from("user_metrics")
      .select("intervencoes")
      .eq("user_id", auth!.userId)
      .single();

    await supabase
      .from("user_metrics")
      .update({
        intervencoes: (metrics?.intervencoes || 0) + 1,
      })
      .eq("user_id", auth!.userId);

    // Audit log
    await supabase.from("audit_log").insert({
      user_id: auth!.userId,
      acao: "responder_thread",
      detalhes: {
        thread_id: id,
        email_id: emailData.id,
      },
      ip: request.headers.get("x-forwarded-for") || "unknown",
    });

    const subject = emailData.subject || "Thread";
    notifySystem("Resposta enviada em thread", subject, "success").catch(() => {});

    return NextResponse.json(emailData, { status: 201 });
  } catch (err) {
    console.error("[THREADS REPLY POST]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
