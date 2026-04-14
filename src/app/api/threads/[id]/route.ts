import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getAuthFromRequest, requireRole, canAccessCompany } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { validateBody } from "@/lib/validation/schemas";
import { z } from "zod";

const updateThreadSchema = z.object({
  status: z.enum(["ABERTO", "EM_PROGRESSO", "FINALIZADO"]),
});

/**
 * GET /api/threads/[id] — Retorna detalhes do thread com emails e participantes
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Rate limiting
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "viewer");
  if (denied) return denied;

  const supabase = createSupabaseAdmin();

  // Fetch thread
  const { data: thread, error: threadError } = await supabase
    .from("threads")
    .select("*, companies(razao_social)")
    .eq("id", id)
    .single();

  if (threadError || !thread) {
    return NextResponse.json(
      { error: "Thread não encontrado" },
      { status: 404 }
    );
  }

  // Check access
  if (!canAccessCompany(auth!, thread.company_id)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  // Fetch participants
  const { data: participants } = await supabase
    .from("thread_participants")
    .select("id, user_id, ativo, created_at")
    .eq("thread_id", id);

  // Fetch emails (from both inbound and outbound)
  const { data: inboundEmails } = await supabase
    .from("email_inbound")
    .select("id, from, to, subject, body, created_at")
    .eq("thread_id", id)
    .order("created_at", { ascending: true });

  const { data: outboundEmails } = await supabase
    .from("email_outbound")
    .select("id, from, to, subject, body, created_at")
    .eq("thread_id", id)
    .order("created_at", { ascending: true });

  // Combine and sort emails by date
  const allEmails = [
    ...(inboundEmails || []).map((e) => ({ ...e, type: "inbound" })),
    ...(outboundEmails || []).map((e) => ({ ...e, type: "outbound" })),
  ].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return NextResponse.json({
    thread,
    participants,
    emails: allEmails,
  });
}

/**
 * PATCH /api/threads/[id] — Atualiza status do thread
 */
export async function PATCH(
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
      updateThreadSchema
    );
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();

    // Fetch thread
    const { data: thread, error: threadError } = await supabase
      .from("threads")
      .select("company_id")
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      status: (parsed as any).status,
    };

    // If finalizing, set finalizado_at and finalizado_por, and deactivate all participants
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((parsed as any).status === "FINALIZADO") {
      updateData.finalizado_at = new Date().toISOString();
      updateData.finalizado_por = auth!.userId;

      // Deactivate all participants
      await supabase
        .from("thread_participants")
        .update({ ativo: false })
        .eq("thread_id", id);
    }

    const { data: updatedThread, error: updateError } = await supabase
      .from("threads")
      .update(updateData as Record<string, unknown>)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Audit log
    await supabase.from("audit_log").insert({
      user_id: auth!.userId,
      acao: "atualizar_thread",
      detalhes: {
        thread_id: id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        status: (parsed as any).status,
      },
      ip: request.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json(updatedThread);
  } catch (err) {
    console.error("[THREADS PATCH]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
