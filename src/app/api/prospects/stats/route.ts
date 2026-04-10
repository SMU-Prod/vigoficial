import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { ProspectService } from "@/lib/services/prospect-service";

/**
 * GET /api/prospects/stats — Estatísticas do pipeline de prospecção
 */
export async function GET(request: NextRequest) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "viewer");
  if (denied) return denied;

  try {
    const stats = await ProspectService.getStats();
    return NextResponse.json(stats);
  } catch (err) {
    console.error("[PROSPECT STATS]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
