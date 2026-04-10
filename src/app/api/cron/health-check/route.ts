import { NextResponse } from "next/server";
import { checkSilentFailures } from "@/lib/observability/failure-alerts";

/**
 * GET /api/cron/health-check
 *
 * Cron endpoint (every 30 min) — verifica falhas silenciosas
 * e gera alertas via system_events + email.
 *
 * Protegido pelo CRON_SECRET no middleware.
 */
export async function GET() {
  try {
    const result = await checkSilentFailures();
    return NextResponse.json({
      ok: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[CRON/HEALTH-CHECK] Erro:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro desconhecido" },
      { status: 500 }
    );
  }
}
