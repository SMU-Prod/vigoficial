import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";

/**
 * GET /api/agents/status
 * Dashboard de status dos agentes IA
 * Retorna métricas das últimas 24h, saúde do sistema, e runs recentes
 */
export async function GET(request: NextRequest) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "viewer");
  if (denied) return denied;

  try {
    const supabase = createSupabaseAdmin();

    // 1. Dashboard de agentes (últimas 24h)
    const { data: dashboard } = await supabase
      .from("vw_agent_dashboard")
      .select("*");

    // 2. Saúde do sistema
    const { data: health } = await supabase
      .from("system_health")
      .select("*")
      .order("updated_at", { ascending: false });

    // 3. Últimas 20 execuções + contagem de decisões por run
    const { data: recentRuns } = await supabase
      .from("agent_runs")
      .select("id, agent_name, run_type, trigger_type, status, company_id, duration_ms, total_tokens_used, total_cost_usd, started_at, completed_at, agent_decisions(count)")
      .order("started_at", { ascending: false })
      .limit(20);

    // 4. Escalonamentos pendentes (human-in-the-loop)
    const { data: escalations } = await supabase
      .from("vw_agent_escalations")
      .select("*")
      .is("human_override", null)
      .limit(10);

    // 5. Custo total últimas 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: costData } = await supabase
      .from("agent_runs")
      .select("total_cost_usd, total_tokens_used, cache_read_tokens")
      .gte("started_at", oneDayAgo);

    const totalCost = (costData || []).reduce((sum, r) => sum + (r.total_cost_usd || 0), 0);
    const totalTokens = (costData || []).reduce((sum, r) => sum + (r.total_tokens_used || 0), 0);
    const totalCacheRead = (costData || []).reduce((sum, r) => sum + (r.cache_read_tokens || 0), 0);
    const cacheHitRate = totalTokens > 0 ? totalCacheRead / totalTokens : 0;

    // 6. IML — Institutional Memory Layer data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let iml = { events: [] as any[], insights: [] as any[], playbookRules: 0, totalEvents: 0 };
    try {
      // Últimos 20 eventos do Event Graph
      const { data: imlEvents } = await supabase
        .from("iml_events")
        .select("id, event_type, entity_type, agent_name, company_id, severity, metadata, occurred_at")
        .order("occurred_at", { ascending: false })
        .limit(20);

      // Insights pendentes de aprovação
      const { data: imlInsights } = await supabase
        .from("iml_insights")
        .select("id, insight_type, title, description, confidence, evidence_count, status, impact_level, related_agent, suggested_action")
        .in("status", ["pending", "ready"])
        .gte("confidence", 0.5)
        .order("confidence", { ascending: false })
        .limit(10);

      // Contadores
      const { count: eventCount } = await supabase
        .from("iml_events")
        .select("*", { count: "exact", head: true });

      const { count: activePlaybook } = await supabase
        .from("iml_playbook_rules")
        .select("*", { count: "exact", head: true })
        .eq("active", true);

      iml = {
        events: imlEvents || [],
        insights: imlInsights || [],
        playbookRules: activePlaybook || 0,
        totalEvents: eventCount || 0,
      };
    } catch (imlErr) {
      // IML tables might not exist yet — silently skip
      console.warn("[AGENTS STATUS] IML data not available:", (imlErr as Error).message);
    }

    return NextResponse.json({
      dashboard: dashboard || [],
      health: health || [],
      recentRuns: recentRuns || [],
      escalations: escalations || [],
      costs24h: {
        totalUsd: Math.round(totalCost * 10000) / 10000,
        totalTokens,
        cacheHitRate: Math.round(cacheHitRate * 10000) / 10000,
      },
      iml,
    });
  } catch (err) {
    console.error("[AGENTS STATUS]", err);
    return NextResponse.json({ error: "Erro ao buscar status dos agentes" }, { status: 500 });
  }
}
