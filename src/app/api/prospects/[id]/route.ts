import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { validateBody, prospectUpdateSchema } from "@/lib/validation/schemas";
import { ProspectService } from "@/lib/services/prospect-service";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { notifySystem } from "@/lib/services/notification-service";

/**
 * GET /api/prospects/[id] — Detalhe do prospect
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

  try {
    const { id } = await params;
    const prospect = await ProspectService.getById(id);

    if (!prospect) {
      return NextResponse.json({ error: "Prospect não encontrado" }, { status: 404 });
    }

    // Busca atividades junto
    const activities = await ProspectService.getActivities(id);

    return NextResponse.json({ ...prospect, activities });
  } catch (err) {
    console.error("[PROSPECTS GET ID]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * PUT /api/prospects/[id] — Atualiza prospect
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "operador");
  if (denied) return denied;

  try {
    const { id } = await params;
    const { data: parsed, error: validationError } = await validateBody(request, prospectUpdateSchema);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // Remove campos imutáveis
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData = { ...(parsed as any) };
    delete updateData.id;
    delete updateData.created_at;
    delete updateData.cnpj;

    const prospect = await ProspectService.update(id, updateData);

    const supabase = createSupabaseAdmin();
    await supabase.from("audit_log").insert({
      user_id: auth!.userId,
      acao: "atualizar_prospect",
      detalhes: { prospect_id: id, campos: Object.keys(updateData) },
      ip: request.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json(prospect);
  } catch (err) {
    console.error("[PROSPECTS PUT]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * PATCH /api/prospects/[id] — Avança status no pipeline
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "operador");
  if (denied) return denied;

  try {
    const { id } = await params;
    const body = await request.json();
    const { status: novoStatus } = body;

    const statusValidos = ["novo", "contatado", "qualificado", "proposta_enviada", "negociacao", "ganho", "perdido"];
    if (!statusValidos.includes(novoStatus)) {
      return NextResponse.json({ error: "Status inválido" }, { status: 400 });
    }

    const prospect = await ProspectService.advanceStatus(id, novoStatus);

    const supabase = createSupabaseAdmin();
    await supabase.from("audit_log").insert({
      user_id: auth!.userId,
      acao: "avancar_prospect",
      detalhes: { prospect_id: id, novo_status: novoStatus },
      ip: request.headers.get("x-forwarded-for") || "unknown",
    });

    if (novoStatus) {
      notifySystem("Prospect avançou no pipeline", `${novoStatus} — prospect atualizado`, "info").catch(() => {});
    }

    return NextResponse.json(prospect);
  } catch (err) {
    console.error("[PROSPECTS PATCH]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
