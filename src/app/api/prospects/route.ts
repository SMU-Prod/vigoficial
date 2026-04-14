import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { validateBody, prospectSchema } from "@/lib/validation/schemas";
import { ProspectService } from "@/lib/services/prospect-service";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { notifyProspectNew } from "@/lib/services/notification-service";
import type { LeadStatus, LeadTemperatura, LeadSegmento, LeadSource } from "@/types/database";

/**
 * GET /api/prospects — Lista prospects com filtros
 */
export async function GET(request: NextRequest) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "viewer");
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);

    const filters = {
      status: searchParams.get("status") as LeadStatus | undefined || undefined,
      temperatura: searchParams.get("temperatura") as LeadTemperatura | undefined || undefined,
      segmento: searchParams.get("segmento") as LeadSegmento | undefined || undefined,
      source: searchParams.get("source") as LeadSource | undefined || undefined,
      uf: searchParams.get("uf") || undefined,
      search: searchParams.get("search") || undefined,
      hasEmail: searchParams.get("hasEmail") === "true" || undefined,
      hasPhone: searchParams.get("hasPhone") === "true" || undefined,
      followupVencido: searchParams.get("followupVencido") === "true" || undefined,
      limit: parseInt(searchParams.get("limit") || "50"),
      offset: parseInt(searchParams.get("offset") || "0"),
      orderBy: searchParams.get("orderBy") || "created_at",
      orderDir: (searchParams.get("orderDir") || "desc") as "asc" | "desc",
    };

    const { data, count } = await ProspectService.getAll(filters);

    return NextResponse.json({ data, count });
  } catch (err) {
    console.error("[PROSPECTS GET]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * POST /api/prospects — Cria novo prospect
 */
export async function POST(request: NextRequest) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "operador");
  if (denied) return denied;

  try {
    const { data: parsed, error: validationError } = await validateBody(request, prospectSchema);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const typedData = parsed as any;

    // Verifica se CNPJ já existe
    const exists = await ProspectService.checkCnpjExists(typedData.cnpj);
    if (exists.asProspect) {
      return NextResponse.json({ error: "CNPJ já existe como prospect" }, { status: 409 });
    }
    if (exists.asCompany) {
      return NextResponse.json({ error: "CNPJ já é um cliente ativo" }, { status: 409 });
    }

    const prospect = await ProspectService.create(typedData);

    // Notification: new prospect created
    notifyProspectNew(
      prospect.razao_social || prospect.cnpj,
      typedData.fonte || "manual",
      prospect.id
    ).catch(() => {});

    // Audit log
    const supabase = createSupabaseAdmin();
    await supabase.from("audit_log").insert({
      user_id: auth!.userId,
      acao: "criar_prospect",
      detalhes: { prospect_id: prospect.id, cnpj: prospect.cnpj },
      ip: request.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json(prospect, { status: 201 });
  } catch (err) {
    console.error("[PROSPECTS POST]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
