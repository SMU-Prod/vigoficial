import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getAuthFromRequest, requireRole, canAccessCompany } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";

/**
 * GET /api/agents/runs
 * Lista execuções dos agentes com filtros
 */
export async function GET(request: NextRequest) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "viewer");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const agentName = searchParams.get("agent");
  const status = searchParams.get("status");
  const companyId = searchParams.get("company_id");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
  const offset = parseInt(searchParams.get("offset") || "0");

  try {
    const supabase = createSupabaseAdmin();

    let query = supabase
      .from("agent_runs")
      .select("*, agent_decisions(count)", { count: "exact" })
      .order("started_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (agentName) query = query.eq("agent_name", agentName);
    if (status) query = query.eq("status", status);
    if (companyId) {
      if (!canAccessCompany(auth!, companyId)) {
        return NextResponse.json({ error: "Sem permissão para esta empresa" }, { status: 403 });
      }
      query = query.eq("company_id", companyId);
    }

    const { data, count, error } = await query;

    if (error) throw error;

    return NextResponse.json({
      runs: data || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (err) {
    console.error("[AGENTS RUNS]", err);
    return NextResponse.json({ error: "Erro ao buscar runs" }, { status: 500 });
  }
}
