import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { DouScraperService } from "@/lib/services/dou-scraper-service";
import { DouAlertService } from "@/lib/services/dou-alert-service";
import { env } from "@/lib/config/env"; // OPS-02
import { notifyDouAlertSent, notifySystem } from "@/lib/services/notification-service";

/**
 * POST /api/dou/scrape — Executa raspagem do DOU para uma data
 * Body: { date: "2026-03-27" }
 * Também usado como cron job diário
 */
export async function POST(request: NextRequest) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  // Verificar se é cron job (via header) ou request autenticado
  const cronSecret = request.headers.get("x-cron-secret");
  const isCron = cronSecret === env.CRON_SECRET;

  if (!isCron) {
    const auth = getAuthFromRequest(request);
    const denied = requireRole(auth, "operador");
    if (denied) return denied;
  }

  try {
    const body = await request.json().catch(() => ({}));

    // Se não informar data, usa ontem (DOU publica no dia seguinte)
    const date = body.date || (() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      // Pular fim de semana (DOU não publica sábado/domingo)
      const dow = d.getDay();
      if (dow === 0) d.setDate(d.getDate() - 2); // domingo → sexta
      if (dow === 6) d.setDate(d.getDate() - 1); // sábado → sexta
      return d.toISOString().split("T")[0];
    })();

    const result = await DouScraperService.scrapeDate(date);

    // Após raspagem, enviar alertas pendentes automaticamente
    let alertResult = null;
    if (result.alertas > 0) {
      try {
        alertResult = await DouAlertService.processarAlertasPendentes();
      } catch (alertErr) {
        console.error("Erro ao enviar alertas pós-scrape:", alertErr);
      }
    }

    // Notifications for DOU scrape results
    if (result.alvaras > 0) {
      notifySystem(
        "DOU raspado com sucesso",
        `${result.alvaras} alvarás extraídos de ${result.publicacoes} publicação(ões) — ${date}`,
        "success"
      ).catch(() => {});
    }
    if (alertResult && alertResult.enviados > 0) {
      notifyDouAlertSent(alertResult.enviados).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      data: result,
      alertas: alertResult ? {
        enviados: alertResult.enviados,
        falhas: alertResult.falhas,
        semEmail: alertResult.semEmail,
      } : null,
      date,
      message: `Raspagem concluída: ${result.alvaras} alvarás extraídos de ${result.publicacoes} publicação(ões)${alertResult ? `, ${alertResult.enviados} alertas enviados` : ""}`,
    });
  } catch (error) {
    console.error("Erro no scrape DOU:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Erro interno" },
      { status: 500 }
    );
  }
}
