import { NextRequest, NextResponse } from "next/server";
import { runFullCycle } from "@/lib/agents";
import { rateLimit, createRateLimitResponse } from "@/lib/security/rate-limit";
import { notifySystem } from "@/lib/services/notification-service";

/**
 * POST /api/cron/trigger
 * Disparado pelo pg_cron às 06h/10h/14h/18h/22h (seg a sáb)
 * Autenticado via CRON_SECRET no middleware
 *
 * Agora usa o Orquestrador IA para coordenar todos os sub-agentes.
 */
export async function POST(request: NextRequest) {
  const cronLimitConfig = { windowMs: 60 * 1000, maxRequests: 10 };
  const limitResult = await rateLimit(request, cronLimitConfig);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  try {
    const state = await runFullCycle();

    notifySystem("Ciclo automático concluído", `Processadas ${state.companiesProcessed || 0} empresas`, "success").catch(() => {});

    return NextResponse.json({
      ok: true,
      runId: state.runId,
      cycleType: state.cycleType,
      empresas: state.companiesProcessed,
      dispatches: state.dispatches?.length ?? 0,
      totalEmailsRead: state.totalEmailsRead,
      totalGespTasks: state.totalGespTasks,
      totalAlerts: state.totalAlerts,
      totalDouItems: state.totalDouItems,
      errors: state.errors.length,
      ciclo: state.cycleTime,
    });
  } catch (err) {
    console.error("[CRON TRIGGER]", err);
    const errorMessage = err instanceof Error ? err.message : "Erro desconhecido";
    notifySystem("Erro no ciclo automático", errorMessage, "danger").catch(() => {});
    return NextResponse.json(
      { error: "Erro ao disparar ciclo completo" },
      { status: 500 }
    );
  }
}
