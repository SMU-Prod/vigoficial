import { NextRequest, NextResponse } from "next/server";
import { runLightCycle } from "@/lib/agents";
import { rateLimit, createRateLimitResponse } from "@/lib/security/rate-limit";

/**
 * POST /api/cron/light — Ciclo dominical leve (09h/14h)
 * Apenas DOU + emails, sem GESP pesado
 *
 * Agora usa o Orquestrador IA para coordenar.
 */
export async function POST(request: NextRequest) {
  const cronLimitConfig = { windowMs: 60 * 1000, maxRequests: 10 };
  const limitResult = await rateLimit(request, cronLimitConfig);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  try {
    const state = await runLightCycle();

    return NextResponse.json({
      ok: true,
      runId: state.runId,
      tipo: "light",
      empresas: state.companiesProcessed,
      dispatches: state.dispatches?.length ?? 0,
      totalEmailsRead: state.totalEmailsRead,
      totalDouItems: state.totalDouItems,
      errors: state.errors.length,
    });
  } catch (err) {
    console.error("[CRON LIGHT]", err);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
