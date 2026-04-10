import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getAuthFromRequest, requireRole, canAccessCompany } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { validateBody, employeeSchema } from "@/lib/validation/schemas";
import { notifySystem } from "@/lib/services/notification-service";
/**
 * GET /api/employees — Lista vigilantes (filtrada por empresa)
 */
export async function GET(request: NextRequest) {
  // Rate limiting
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "viewer");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("company_id");
  const status = searchParams.get("status");
  const search = searchParams.get("search");

  const supabase = createSupabaseAdmin();

  let query = supabase
    .from("employees")
    .select("*, companies(razao_social)")
    .order("nome_completo");

  // Filtro por empresa
  if (companyId) {
    if (!canAccessCompany(auth!, companyId)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
    query = query.eq("company_id", companyId);
  } else if (auth!.role !== "admin") {
    query = query.in("company_id", auth!.companyIds);
  }

  if (status) {
    query = query.eq("status", status);
  }

  if (search) {
    query = query.or(`nome_completo.ilike.%${search}%,cpf.ilike.%${search}%`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

/**
 * POST /api/employees — Cadastra novo vigilante
 */
export async function POST(request: NextRequest) {
  // Rate limiting
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "operador");
  if (denied) return denied;

  try {
    // Validate body
    const { data: parsed, error: validationError } = await validateBody(request, employeeSchema);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!canAccessCompany(auth!, (parsed as any).company_id)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const supabase = createSupabaseAdmin();

    // Limpa CPF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cpfLimpo = (parsed as any).cpf.replace(/\D/g, "");

    // Verifica duplicidade na empresa
    const { data: existing } = await supabase
      .from("employees")
      .select("id")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .eq("company_id", (parsed as any).company_id)
      .eq("cpf", cpfLimpo)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "Já existe um vigilante com este CPF nesta empresa" },
        { status: 409 }
      );
    }

    const { data: insertedData, error: dbError } = await supabase
      .from("employees")
      .insert({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(parsed as any),
        cpf: cpfLimpo,
      })
      .select()
      .single();

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    // Audit log
    await supabase.from("audit_log").insert({
      user_id: auth!.userId,
      acao: "criar_vigilante",
      detalhes: {
        employee_id: insertedData.id,
        company_id: insertedData.company_id,
        nome: insertedData.nome_completo,
      },
      ip: request.headers.get("x-forwarded-for") || "unknown",
    });

    notifySystem("Novo vigilante cadastrado", insertedData.nome_completo || "Vigilante", "info").catch(() => {});

    return NextResponse.json(insertedData, { status: 201 });
  } catch (err: unknown) {
    console.error("[EMPLOYEES POST]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
