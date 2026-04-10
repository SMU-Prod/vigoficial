import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { logger } from "@/lib/observability/logger"; // OPS-06: Structured logging

/**
 * POST /api/agents/control
 * Pause/resume individual agent queues
 * Body: { agent: string, action: "pause" | "resume" }
 *
 * Uses system_health table to track agent states
 */
export async function POST(request: NextRequest) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "admin");
  if (denied) return denied;

  try {
    const body = await request.json();
    const { agent, action } = body;

    const validAgents = ["captador", "operacional", "comunicador", "orquestrador", "all"];
    const validActions = ["pause", "resume"];

    if (!validAgents.includes(agent)) {
      return NextResponse.json({ error: `Agente inválido. Use: ${validAgents.join(", ")}` }, { status: 400 });
    }
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: "Ação inválida. Use: pause, resume" }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();
    const agents = agent === "all" ? ["captador", "operacional", "comunicador", "orquestrador"] : [agent];
    const isPaused = action === "pause";

    for (const a of agents) {
      await supabase
        .from("system_health")
        .upsert({
          component: `agent_${a}`,
          status: isPaused ? "paused" : "healthy",
          details: { paused: isPaused, paused_at: isPaused ? new Date().toISOString() : null, paused_by: auth?.userId || "admin" },
          updated_at: new Date().toISOString(),
        }, { onConflict: "component" });
    }

    // Log to audit
    await supabase.from("audit_log").insert({
      action: `agent_${action}`,
      entity_type: "agent",
      entity_id: agent,
      details: { agents, action, by: auth?.userId || "admin" },
      user_id: auth?.userId || null,
    });

    return NextResponse.json({
      ok: true,
      agents,
      action,
      message: `${agents.join(", ")} ${isPaused ? "pausado(s)" : "retomado(s)"}`
    });
  } catch (err) {
    logger.error("Erro ao controlar agente", err as Error); // OPS-06
    return NextResponse.json({ error: "Erro ao controlar agente" }, { status: 500 });
  }
}

/**
 * GET /api/agents/control
 * Get current pause state of all agents
 */
export async function GET(request: NextRequest) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "admin");
  if (denied) return denied;

  try {
    const supabase = createSupabaseAdmin();
    const { data } = await supabase
      .from("system_health")
      .select("component, status, details, updated_at")
      .like("component", "agent_%");

    const agentStates: Record<string, { paused: boolean; pausedAt: string | null; pausedBy: string | null }> = {};

    for (const name of ["captador", "operacional", "comunicador", "orquestrador"]) {
      const record = data?.find((d) => d.component === `agent_${name}`);
      agentStates[name] = {
        paused: record?.status === "paused",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pausedAt: (record?.details as any)?.paused_at || null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pausedBy: (record?.details as any)?.paused_by || null,
      };
    }

    return NextResponse.json({ agents: agentStates });
  } catch (err) {
    logger.error("Erro ao buscar estado dos agentes", err as Error); // OPS-06
    return NextResponse.json({ error: "Erro ao buscar estado dos agentes" }, { status: 500 });
  }
}
