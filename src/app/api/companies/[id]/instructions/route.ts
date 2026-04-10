import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getAuthFromRequest, requireRole, canAccessCompany } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { companyInstructionSchema } from "@/lib/validation/schemas";

/**
 * GET /api/companies/[id]/instructions — Lista instruções VIG PRO da empresa
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "viewer");
  if (denied) return denied;

  const { id } = await params;

  if (!canAccessCompany(auth!, id)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const supabase = createSupabaseAdmin();

  // Buscar instruções da empresa (e da matriz, se for filial)
  const { data: company } = await supabase
    .from("companies")
    .select("id, matriz_id, tipo_unidade")
    .eq("id", id)
    .single();

  if (!company) {
    return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
  }

  // Se for filial, busca instruções da matriz também
  const companyIds = [id];
  if (company.matriz_id) {
    companyIds.push(company.matriz_id);
  }

  const { data, error } = await supabase
    .from("company_instructions")
    .select("*")
    .in("company_id", companyIds)
    .order("categoria")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

/**
 * POST /api/companies/[id]/instructions — Cria instrução VIG PRO
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "admin");
  if (denied) return denied;

  const { id } = await params;

  try {
    const body = await request.json();
    const schema = companyInstructionSchema.omit({ company_id: true });
    const parsed = schema.parse(body);

    const supabase = createSupabaseAdmin();

    const { data, error } = await supabase
      .from("company_instructions")
      .insert({
        ...parsed,
        company_id: id,
        created_by: auth!.userId,
        updated_by: auth!.userId,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Audit log
    await supabase.from("audit_log").insert({
      user_id: auth!.userId,
      acao: "criar_instrucao_vigipro",
      detalhes: { company_id: id, instruction_id: data.id, titulo: data.titulo },
      ip: request.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json(data, { status: 201 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    if (err.name === "ZodError") {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    console.error("[INSTRUCTIONS POST]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
