import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getAuthFromRequest, requireRole, canAccessCompany } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { validateBody, companySchema } from "@/lib/validation/schemas";
import { addEmailSendJob } from "@/lib/queue/jobs";
import { checkAndUpdateAlertas } from "@/lib/compliance/engine";
import { notifySystem } from "@/lib/services/notification-service";

/**
 * GET /api/companies/[id] — Detalhes de uma empresa
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

  if (!canAccessCompany(auth!, id)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
  }

  return NextResponse.json(data);
}

/**
 * PUT /api/companies/[id] — Atualiza empresa
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
  const denied = requireRole(auth, "admin");
  if (denied) return denied;

  const { id } = await params;
  const body = await request.json();

  // Validate body (partial update)
  const updateSchema = companySchema.partial();
  const { data: _validated, error: validationError } = await validateBody(request, updateSchema);
  if (validationError && Object.keys(validationError).length > 0) {
    console.warn("Validation warnings on company update:", validationError);
  }

  const supabase = createSupabaseAdmin();

  // Remove campos que não podem ser atualizados via API
  const { id: _id, created_at: _created_at, ...updateData } = body;

  const { data: updatedData, error: dbError } = await supabase
    .from("companies")
    .update(updateData as Record<string, unknown>)
    .eq("id", id)
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  // R9: Update alert status when validity dates are renewed
  const validityFields = ["alvara_validade", "ecpf_validade"];

  for (const field of validityFields) {
    if (field in updateData && updateData[field]) {
      const campo = field === "alvara_validade" ? "alvara" : "ecpf";
      try {
        await checkAndUpdateAlertas(
          id,
          "company",
          id,
          campo,
          updateData[field] as string
        );
      } catch (err) {
        console.error(`[COMPANY-UPDATE] Erro ao atualizar alertas para ${campo}:`, err);
      }
    }
  }

  // Audit log
  await supabase.from("audit_log").insert({
    user_id: auth!.userId,
    acao: "editar_empresa",
    detalhes: { company_id: id, campos: Object.keys(updateData) },
    ip: request.headers.get("x-forwarded-for") || "unknown",
  });

  return NextResponse.json(updatedData);
}

/**
 * PATCH /api/companies/[id] — Habilita/desabilita empresa (PRD Seção 4.4)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limiting
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "admin");
  if (denied) return denied;

  const { id } = await params;
  const body = await request.json();
  const { acao } = body;

  if (!acao || !["habilitar", "desabilitar"].includes(acao)) {
    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();

  if (acao === "habilitar") {
    const proximaCobranca = new Date();
    proximaCobranca.setDate(proximaCobranca.getDate() + 30);

    const { data, error } = await supabase
      .from("companies")
      .update({
        habilitada: true,
        billing_status: "ativo",
        data_proxima_cobranca: proximaCobranca.toISOString().split("T")[0],
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Audit log
    await supabase.from("audit_log").insert({
      user_id: auth!.userId,
      acao: "habilitar_empresa",
      detalhes: { company_id: id },
      ip: request.headers.get("x-forwarded-for") || "unknown",
    });

    // Dispatch welcome email (Template A) via queue
    try {
      await addEmailSendJob({
        companyId: id,
        templateId: "A",
        mode: "CLIENTE_HTML",
        to: data.email_responsavel || data.email_operacional,
        subject: "Bem-vindo ao VigiPRO",
        payload: {
          razao_social: data.razao_social,
        },
      });
    } catch (err) {
      console.error(`[COMPANIES-PATCH] Erro ao disparar Template A para empresa ${id}:`, err);
    }

    notifySystem("Empresa habilitada", data.razao_social, "success").catch(() => {});

    return NextResponse.json(data);
  }

  if (acao === "desabilitar") {
    const { data, error } = await supabase
      .from("companies")
      .update({ habilitada: false, billing_status: "cancelado" })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    notifySystem("Empresa desabilitada", data.razao_social, "warning").catch(() => {});

    return NextResponse.json(data);
  }
}
