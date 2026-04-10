import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { companyInstructionSchema } from "@/lib/validation/schemas";

/**
 * PUT /api/companies/[id]/instructions/[instructionId] — Atualiza instrução
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; instructionId: string }> }
) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "admin");
  if (denied) return denied;

  const { id, instructionId } = await params;

  try {
    const body = await request.json();
    const schema = companyInstructionSchema.omit({ company_id: true }).partial();
    const parsed = schema.parse(body);

    const supabase = createSupabaseAdmin();

    const { data, error } = await supabase
      .from("company_instructions")
      .update({
        ...parsed,
        updated_by: auth!.userId,
      })
      .eq("id", instructionId)
      .eq("company_id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Instrução não encontrada" }, { status: 404 });
    }

    // Audit log
    await supabase.from("audit_log").insert({
      user_id: auth!.userId,
      acao: "editar_instrucao_vig_pro",
      detalhes: { company_id: id, instruction_id: instructionId, campos: Object.keys(parsed) },
      ip: request.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json(data);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    if (err.name === "ZodError") {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    console.error("[INSTRUCTIONS PUT]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * DELETE /api/companies/[id]/instructions/[instructionId] — Remove instrução
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; instructionId: string }> }
) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "admin");
  if (denied) return denied;

  const { id, instructionId } = await params;

  const supabase = createSupabaseAdmin();

  // Verifica se existe
  const { data: existing } = await supabase
    .from("company_instructions")
    .select("id, titulo")
    .eq("id", instructionId)
    .eq("company_id", id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Instrução não encontrada" }, { status: 404 });
  }

  const { error } = await supabase
    .from("company_instructions")
    .delete()
    .eq("id", instructionId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Audit log
  await supabase.from("audit_log").insert({
    user_id: auth!.userId,
    acao: "excluir_instrucao_vig_pro",
    detalhes: { company_id: id, instruction_id: instructionId, titulo: existing.titulo },
    ip: request.headers.get("x-forwarded-for") || "unknown",
  });

  return NextResponse.json({ success: true });
}
