import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { z } from "zod";
import { validateBody, companySchema } from "@/lib/validation/schemas";
import { validateCsrf } from "@/lib/security/csrf-middleware"; // FE-02
import { notifySystem } from "@/lib/services/notification-service";


/**
 * GET /api/companies — Lista todas as empresas (filtrada por role)
 */
export async function GET(request: NextRequest) {
  // Rate limiting
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "viewer");
  if (denied) return denied;

  const supabase = createSupabaseAdmin();

  let query = supabase
    .from("companies")
    .select("*")
    .order("razao_social");

  // Operador/viewer: só empresas autorizadas
  if (auth!.role !== "admin" && auth!.companyIds.length > 0) {
    query = query.in("id", auth!.companyIds);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

/**
 * POST /api/companies — Cadastra nova empresa (admin only)
 */
export async function POST(request: NextRequest) {
  // FE-02: CSRF validation for mutation endpoint
  const csrfCheck = validateCsrf(request);
  if (!csrfCheck.valid) {
    console.warn("[COMPANIES POST] CSRF validation failed:", csrfCheck.error);
    return NextResponse.json(
      { error: "CSRF token validation failed" },
      { status: 403 }
    );
  }

  // Rate limiting
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "admin");
  if (denied) return denied;

  try {
    // Validate body
    const { data: parsed, error: validationError } = await validateBody(request, companySchema);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();

    // FE-01: Properly type-cast parsed data using schema validation result
    const typedData = parsed as z.infer<typeof companySchema>;
    const cleanCnpj = typedData.cnpj.replace(/\D/g, "");

    // Verifica duplicidade de CNPJ
    const { data: existing } = await supabase
      .from("companies")
      .select("id")
      .eq("cnpj", cleanCnpj)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "Já existe uma empresa com este CNPJ" },
        { status: 409 }
      );
    }

    const { data: insertedData, error: dbError } = await supabase
      .from("companies")
      .insert({
        ...typedData,
        cnpj: cleanCnpj,
      })
      .select()
      .single();

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    // Audit log
    await supabase.from("audit_log").insert({
      user_id: auth!.userId,
      acao: "criar_empresa",
      detalhes: { company_id: insertedData.id, cnpj: insertedData.cnpj },
      ip: request.headers.get("x-forwarded-for") || "unknown",
    });

    notifySystem("Nova empresa cadastrada", insertedData.razao_social || "Empresa", "success").catch(() => {});

    return NextResponse.json(insertedData, { status: 201 });
  } catch (err) {
    console.error("[COMPANIES POST]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
