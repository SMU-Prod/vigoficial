import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { DouAlertService } from "@/lib/services/dou-alert-service";
import { env } from "@/lib/config/env"; // OPS-02

/**
 * POST /api/dou/alertas/enviar — Processa e envia todos os alertas pendentes
 * Pode ser chamado por cron job ou manualmente por admin/operador
 */
export async function POST(request: NextRequest) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  // Aceitar cron secret OU autenticação de operador
  const cronSecret = request.headers.get("x-cron-secret");
  if (cronSecret && cronSecret === env.CRON_SECRET) {
    // Autorizado via cron
  } else {
    const auth = getAuthFromRequest(request);
    const denied = requireRole(auth, "operador");
    if (denied) return denied;
  }

  try {
    const resultado = await DouAlertService.processarAlertasPendentes();

    return NextResponse.json({
      success: true,
      data: {
        enviados: resultado.enviados,
        falhas: resultado.falhas,
        semEmail: resultado.semEmail,
        total: resultado.detalhes.length,
        detalhes: resultado.detalhes,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro ao processar alertas",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/dou/alertas/enviar — Resumo dos alertas
 */
export async function GET(request: NextRequest) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "viewer");
  if (denied) return denied;

  try {
    const resumo = await DouAlertService.getResumoAlertas();
    return NextResponse.json({ success: true, data: resumo });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro ao buscar resumo",
      },
      { status: 500 }
    );
  }
}
