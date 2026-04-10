import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";

/**
 * GET /api/agents/decisions
 * Lista decisões tomadas pelos agentes IA (audit trail)
 */
export async function GET(request: NextRequest) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "admin");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("run_id");
  const agentName = searchParams.get("agent");
  const escalatedOnly = searchParams.get("escalated") === "true";
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);

  try {
    const supabase = createSupabaseAdmin();

    let query = supabase
      .from("agent_decisions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (runId) query = query.eq("run_id", runId);
    if (agentName) query = query.eq("agent_name", agentName);
    if (escalatedOnly) query = query.eq("escalated_to_human", true);

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({ decisions: data || [] });
  } catch (err) {
    console.error("[AGENTS DECISIONS]", err);
    return NextResponse.json({ error: "Erro ao buscar decisões" }, { status: 500 });
  }
}

/**
 * PATCH /api/agents/decisions
 * Registra override humano em uma decisão escalada
 */
export async function PATCH(request: NextRequest) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "operador");
  if (denied) return denied;

  try {
    const body = await request.json();
    const { decisionId, humanOverride } = body;

    if (!decisionId || !humanOverride) {
      return NextResponse.json(
        { error: "decisionId e humanOverride são obrigatórios" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdmin();

    const { data, error } = await supabase
      .from("agent_decisions")
      .update({ human_override: humanOverride })
      .eq("id", decisionId)
      .eq("escalated_to_human", true)
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      return NextResponse.json(
        { error: "Decisão não encontrada ou não está escalada" },
        { status: 404 }
      );
    }

    // Log to audit
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await supabase.from("audit_log").insert({
      user_id: auth.userId,
      acao: "agent_decision_override",
      detalhes: { decisionId, humanOverride, agentName: data.agent_name },
    });

    return NextResponse.json({ ok: true, decision: data });
  } catch (err) {
    console.error("[AGENTS DECISION OVERRIDE]", err);
    return NextResponse.json({ error: "Erro ao registrar override" }, { status: 500 });
  }
}
