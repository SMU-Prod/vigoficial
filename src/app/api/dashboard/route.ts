import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { cacheGetOrSet, CACHE_TTL } from "@/lib/redis/cache";

const EMPTY_KPIS = {
  total_empresas_ativas: 0,
  total_vigilantes_ativos: 0,
  workflows_abertos: 0,
  workflows_urgentes: 0,
  validades_criticas: 0,
  gesp_tasks_pendentes: 0,
  emails_enviados_hoje: 0,
  total_veiculos_ativos: 0,
  divergencias_abertas: 0,
};

/**
 * GET /api/dashboard — KPIs do dashboard (view vw_dashboard_kpis)
 * Cached por 5 min via Redis (fallback direto ao DB se Redis indisponível).
 */
export async function GET(request: NextRequest) {
  // Rate limiting
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "viewer");
  if (denied) return denied;

  const data = await cacheGetOrSet(
    "dashboard:kpis",
    async () => {
      const supabase = createSupabaseAdmin();
      const { data, error } = await supabase
        .from("vw_dashboard_kpis")
        .select("*")
        .single();

      if (error) return EMPTY_KPIS;
      return data;
    },
    CACHE_TTL.dashboard
  );

  return NextResponse.json(data);
}
