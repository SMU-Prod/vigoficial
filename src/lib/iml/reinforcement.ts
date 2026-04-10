/**
 * VIGI PRO — Institutional Memory Layer: Reinforcement Learning
 *
 * Lightweight aprendizado por reforço para decisões de agente.
 * Registra outcomes (sucesso/falha) para cada decision_type em contexto específico.
 * Usa histórico para calcular probabilidade de sucesso e guiar futuras decisões.
 *
 * Fluxo:
 * 1. Agente toma decisão em contexto (company_id, action_type, hora, etc.)
 * 2. recordOutcome() registra resultado (sucesso/falha + duração)
 * 3. getDecisionWeight() consulta taxa de sucesso histórica
 * 4. shouldAttempt() decide se agente deve tentar com base no histórico
 * 5. Se falha repetida (< 30% após 10+ tentativas), sugere escalação humana
 */

import { createSupabaseAdmin } from "@/lib/supabase/server";

// ─── Types ───

export interface DecisionWeight {
  agent_name: string;
  decision_type: string;
  context_key: string; // e.g. "company:abc|action:cadastrar_vigilante"
  success_count: number;
  failure_count: number;
  total_count: number;
  success_rate: number;
  avg_duration_ms: number;
  avg_confidence: number;
  last_updated: string;
}

export interface ReinforcementSignal {
  agent_name: string;
  decision_type: string;
  context: Record<string, string>; // company_id, action_type, hour, etc.
  outcome: "success" | "failure";
  duration_ms: number;
  confidence: number;
}

export interface AttemptDecision {
  attempt: boolean;
  confidence: number;
  reason: string;
}

// ─── Context Key Building ───

/**
 * Constrói chave determinística para um contexto.
 * Garante que mesmo contexto sempre produz mesma chave.
 * Exemplo: { company_id: "abc", action_type: "cadastrar" } → "company_id:abc|action_type:cadastrar"
 */
export function buildContextKey(context: Record<string, string>): string {
  const entries = Object.entries(context)
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .map(([k, v]) => `${k}:${v}`);
  return entries.join("|");
}

// ─── Record Outcome ───

/**
 * Registra outcome de uma decisão.
 * Atualiza DecisionWeight via upsert baseado em context_key.
 * Operação silenciosa — erros não lançam.
 */
export async function recordOutcome(signal: ReinforcementSignal): Promise<void> {
  const supabase = createSupabaseAdmin();
  const contextKey = buildContextKey(signal.context);

  try {
    // Upsert: atualiza se existe, cria se não
    const { data: existing } = await supabase
      .from("iml_decision_weights")
      .select("*")
      .eq("agent_name", signal.agent_name)
      .eq("decision_type", signal.decision_type)
      .eq("context_key", contextKey)
      .single();

    const isSuccess = signal.outcome === "success";
    const successCount = (existing?.success_count ?? 0) + (isSuccess ? 1 : 0);
    const failureCount = (existing?.failure_count ?? 0) + (isSuccess ? 0 : 1);
    const totalCount = successCount + failureCount;
    const successRate = totalCount > 0 ? successCount / totalCount : 0;

    // Média móvel para duração e confiança
    const oldAvgDuration = existing?.avg_duration_ms ?? 0;
    const newAvgDuration = (oldAvgDuration * (totalCount - 1) + signal.duration_ms) / totalCount;
    const oldAvgConfidence = existing?.avg_confidence ?? 0;
    const newAvgConfidence = (oldAvgConfidence * (totalCount - 1) + signal.confidence) / totalCount;

    const upsertData = {
      agent_name: signal.agent_name,
      decision_type: signal.decision_type,
      context_key: contextKey,
      success_count: successCount,
      failure_count: failureCount,
      total_count: totalCount,
      success_rate: successRate,
      avg_duration_ms: newAvgDuration,
      avg_confidence: newAvgConfidence,
      last_updated: new Date().toISOString(),
    };

    if (existing) {
      await supabase
        .from("iml_decision_weights")
        .update(upsertData)
        .eq("id", existing.id);
    } else {
      await supabase.from("iml_decision_weights").insert(upsertData);
    }

    console.log(
      `[Reinforcement] ${signal.agent_name}/${signal.decision_type}: ${signal.outcome} (rate: ${(successRate * 100).toFixed(1)}%)`
    );
  } catch (err) {
    console.error("[Reinforcement] recordOutcome error:", err);
  }
}

// ─── Get Decision Weight ───

/**
 * Busca o peso (histórico de sucesso) para uma decisão em contexto.
 * Retorna null se nenhum histórico existe.
 */
export async function getDecisionWeight(
  agentName: string,
  decisionType: string,
  context: Record<string, string>
): Promise<DecisionWeight | null> {
  const supabase = createSupabaseAdmin();
  const contextKey = buildContextKey(context);

  try {
    const { data, error } = await supabase
      .from("iml_decision_weights")
      .select("*")
      .eq("agent_name", agentName)
      .eq("decision_type", decisionType)
      .eq("context_key", contextKey)
      .single();

    if (error || !data) return null;

    return {
      agent_name: data.agent_name,
      decision_type: data.decision_type,
      context_key: data.context_key,
      success_count: data.success_count,
      failure_count: data.failure_count,
      total_count: data.total_count,
      success_rate: data.success_rate,
      avg_duration_ms: data.avg_duration_ms,
      avg_confidence: data.avg_confidence,
      last_updated: data.last_updated,
    };
  } catch (err) {
    console.error("[Reinforcement] getDecisionWeight error:", err);
    return null;
  }
}

// ─── Should Attempt Decision ───

/**
 * Decide se agente deve tentar uma ação baseado no histórico.
 * Retorna { attempt: boolean, confidence: number, reason: string }
 *
 * Lógica:
 * - Sem histórico: attempt=true (first try)
 * - Success rate > 70%: attempt=true com alta confiança
 * - Success rate 30-70%: attempt=true com confiança média (retry)
 * - Success rate < 30% E total_count >= 10: attempt=false, sugere escalação
 * - < 10 tentativas mesmo com taxa baixa: attempt=true (precisa mais dados)
 */
export async function shouldAttempt(
  agentName: string,
  decisionType: string,
  context: Record<string, string>
): Promise<AttemptDecision> {
  const weight = await getDecisionWeight(agentName, decisionType, context);

  // Sem histórico: tenta primeira vez
  if (!weight) {
    return {
      attempt: true,
      confidence: 0.5,
      reason: "No historical data — first attempt",
    };
  }

  // Sucesso alta taxa: confia
  if (weight.success_rate >= 0.7) {
    return {
      attempt: true,
      confidence: weight.success_rate,
      reason: `High success rate (${(weight.success_rate * 100).toFixed(1)}%)`,
    };
  }

  // Sucesso moderada taxa: tenta novamente
  if (weight.success_rate >= 0.3) {
    return {
      attempt: true,
      confidence: weight.success_rate,
      reason: `Moderate success rate (${(weight.success_rate * 100).toFixed(1)}%) — retry with monitoring`,
    };
  }

  // Sucesso baixa taxa E suficientes tentativas: escalação
  if (weight.total_count >= 10) {
    return {
      attempt: false,
      confidence: weight.success_rate,
      reason: `Low success rate (${(weight.success_rate * 100).toFixed(1)}%) after ${weight.total_count} attempts — suggest human escalation`,
    };
  }

  // Sucesso baixa taxa MAS poucas tentativas: continua coletando dados
  return {
    attempt: true,
    confidence: weight.success_rate,
    reason: `Low success rate but insufficient attempts (${weight.total_count}/10) — continue to gather data`,
  };
}

// ─── Agent Performance Profile ───

/**
 * Retorna todos os decision weights para um agente, ordenado por taxa de sucesso.
 * Útil para dashboard ou análise de performance do agente.
 */
export async function getAgentPerformanceProfile(agentName: string): Promise<DecisionWeight[]> {
  const supabase = createSupabaseAdmin();

  try {
    const { data, error } = await supabase
      .from("iml_decision_weights")
      .select("*")
      .eq("agent_name", agentName)
      .order("success_rate", { ascending: false });

    if (error || !data) return [];

    return data.map((d) => ({
      agent_name: d.agent_name,
      decision_type: d.decision_type,
      context_key: d.context_key,
      success_count: d.success_count,
      failure_count: d.failure_count,
      total_count: d.total_count,
      success_rate: d.success_rate,
      avg_duration_ms: d.avg_duration_ms,
      avg_confidence: d.avg_confidence,
      last_updated: d.last_updated,
    }));
  } catch (err) {
    console.error("[Reinforcement] getAgentPerformanceProfile error:", err);
    return [];
  }
}

/**
 * Retorna estatísticas agregadas para um agente (usado para análise rápida).
 */
export async function getAgentSummaryStats(agentName: string): Promise<{
  totalDecisions: number;
  overallSuccessRate: number;
  decisionTypes: string[];
  topContexts: Array<{ context: string; successRate: number }>;
} | null> {
  const profile = await getAgentPerformanceProfile(agentName);

  if (profile.length === 0) {
    return null;
  }

  const totalDecisions = profile.reduce((sum, w) => sum + w.total_count, 0);
  const totalSuccesses = profile.reduce((sum, w) => sum + w.success_count, 0);
  const overallSuccessRate = totalDecisions > 0 ? totalSuccesses / totalDecisions : 0;
  const decisionTypes = [...new Set(profile.map((w) => w.decision_type))];
  const topContexts = profile
    .sort((a, b) => b.success_rate - a.success_rate)
    .slice(0, 5)
    .map((w) => ({
      context: w.context_key,
      successRate: w.success_rate,
    }));

  return {
    totalDecisions,
    overallSuccessRate,
    decisionTypes,
    topContexts,
  };
}
