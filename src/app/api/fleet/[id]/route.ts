import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getAuthFromRequest, requireRole, canAccessCompany } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { validateBody, vehicleSchema } from "@/lib/validation/schemas";
import { checkAndUpdateAlertas } from "@/lib/compliance/engine";

/**
 * GET /api/fleet/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limiting
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "viewer");
  if (denied) return denied;

  const { id } = await params;
  const supabase = createSupabaseAdmin();

  const { data, error } = await supabase
    .from("vehicles")
    .select("*, companies(razao_social, cnpj)")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Veículo não encontrado" }, { status: 404 });
  }

  if (!canAccessCompany(auth!, data.company_id)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  return NextResponse.json(data);
}

/**
 * PUT /api/fleet/[id]
 * Atualiza veículo e checa alertas para validades renovadas (R9)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limiting
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "operador");
  if (denied) return denied;

  const { id } = await params;
  const body = await request.json();

  // Validate body (partial update)
  const updateSchema = vehicleSchema.partial();
  const { data: _validated, error: validationError } = await validateBody(request, updateSchema);
  if (validationError && Object.keys(validationError).length > 0) {
    console.warn("Validation warnings on vehicle update:", validationError);
  }

  const supabase = createSupabaseAdmin();

  // Verifica se veículo existe e pega company_id
  const { data: existing } = await supabase
    .from("vehicles")
    .select("company_id")
    .eq("id", id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Veículo não encontrado" }, { status: 404 });
  }

  if (!canAccessCompany(auth!, existing.company_id)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id: _id, created_at: _created_at, ...updateData } = body;

  const { data: updatedData, error: dbError } = await supabase
    .from("vehicles")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  // R9: Update alert status when validity dates are renewed
  const validityFields = [
    "licenciamento_validade",
    "seguro_validade",
    "vistoria_pf_validade",
  ];

  for (const field of validityFields) {
    if (field in updateData && updateData[field]) {
      const campo = field === "licenciamento_validade"
        ? "licenciamento"
        : field === "seguro_validade"
          ? "seguro"
          : "vistoria_pf";
      try {
        await checkAndUpdateAlertas(
          existing.company_id,
          "vehicle",
          id,
          campo,
          updateData[field] as string
        );
      } catch (err) {
        console.error(`[FLEET-UPDATE] Erro ao atualizar alertas para ${campo}:`, err);
      }
    }
  }

  await supabase.from("audit_log").insert({
    user_id: auth!.userId,
    acao: "editar_veiculo",
    detalhes: { vehicle_id: id, campos: Object.keys(updateData) },
    ip: request.headers.get("x-forwarded-for") || "unknown",
  });

  return NextResponse.json(updatedData);
}

/**
 * DELETE /api/fleet/[id]
 * Remove veículo com verificação de permissão e audit log
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "operador");
  if (denied) return denied;

  const { id } = await params;
  const supabase = createSupabaseAdmin();

  // Verifica se veículo existe e pega company_id
  const { data: existing } = await supabase
    .from("vehicles")
    .select("company_id, placa")
    .eq("id", id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Veículo não encontrado" }, { status: 404 });
  }

  if (!canAccessCompany(auth!, existing.company_id)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { error: dbError } = await supabase
    .from("vehicles")
    .delete()
    .eq("id", id);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  await supabase.from("audit_log").insert({
    user_id: auth!.userId,
    acao: "remover_veiculo",
    detalhes: { vehicle_id: id, placa: existing.placa, company_id: existing.company_id },
    ip: request.headers.get("x-forwarded-for") || "unknown",
  });

  return NextResponse.json({ success: true });
}
