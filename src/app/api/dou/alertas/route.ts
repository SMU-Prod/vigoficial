import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { DouScraperService } from "@/lib/services/dou-scraper-service";

/**
 * GET /api/dou/alertas — Lista alertas pendentes
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
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    const result = await DouScraperService.getAlertasPendentes(limit, offset);
    return NextResponse.json({ success: true, data: result.data, total: result.count });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Erro interno" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/dou/alertas — Marcar alerta como enviado
 * Body: { alertaId, canal }
 */
export async function PATCH(request: NextRequest) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "operador");
  if (denied) return denied;

  try {
    const { alertaId, canal } = await request.json();
    if (!alertaId) return NextResponse.json({ success: false, error: "alertaId obrigatório" }, { status: 400 });

    await DouScraperService.marcarAlertaEnviado(alertaId, canal || "manual");
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Erro interno" },
      { status: 500 }
    );
  }
}
