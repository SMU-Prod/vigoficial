import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getAuthFromRequest, requireRole, canAccessCompany } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { validateBody, vehicleSchema } from "@/lib/validation/schemas";
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

  const supabase = createSupabaseAdmin();
  let query = supabase.from("vehicles").select("*").order("placa");

  if (companyId) {
    if (!canAccessCompany(auth!, companyId)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
    query = query.eq("company_id", companyId);
  } else if (auth!.role !== "admin") {
    query = query.in("company_id", auth!.companyIds);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

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
    const { data: parsed, error: validationError } = await validateBody(request, vehicleSchema);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!canAccessCompany(auth!, (parsed as any).company_id)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const supabase = createSupabaseAdmin();
    const { data: insertedData, error: dbError } = await supabase
      .from("vehicles")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(parsed as any)
      .select()
      .single();

    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
    return NextResponse.json(insertedData, { status: 201 });
  } catch (err: unknown) {
    console.error("[FLEET POST]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
