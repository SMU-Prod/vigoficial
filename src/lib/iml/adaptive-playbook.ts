/**
 * VIGI PRO — Institutional Memory Layer: Adaptive Playbook
 *
 * Camada de parametrização dinâmica sobre as 12 regras R1-R12.
 * Não substitui regras — as parametriza baseado em insights aprovados pelo admin.
 *
 * IMPORTANTE: Toda ação automática requer admin_approved = true.
 * O Playbook só sugere, nunca age sem confirmação humana.
 *
 * Uso por agentes:
 *   const adjustments = await queryPlaybook("R8", { company_id: "xxx", hour: 14 });
 *   if (adjustments) { applyAdjustments(adjustments); }
 */
import { createSupabaseAdmin } from "@/lib/supabase/server";

// ─── Types ───

export interface PlaybookRule {
  id: string;
  rule_code: string;
  param_name: string;
  default_value: unknown;
  adjusted_value: unknown;
  apply_context: Record<string, unknown>;
  active: boolean;
  description: string | null;
  source_insight_id: string | null;
  times_applied: number;
  effectiveness_score: number | null;
}

export interface PlaybookAdjustment {
  ruleCode: string;
  paramName: string;
  adjustedValue: unknown;
  context: Record<string, unknown>;
  playbookRuleId: string;
}

export interface PlaybookQueryContext {
  companyId?: string;
  agentName?: string;
  hour?: number;
  dayOfWeek?: number;
  desp?: string;
  [key: string]: unknown;
}

// ─── Playbook Query ───

/**
 * Consulta o Playbook para ajustes aplicáveis a uma regra no contexto atual.
 * Retorna array de ajustes a aplicar (vazio se nenhum).
 *
 * Apenas regras ativas (admin_approved) são retornadas.
 */
export async function queryPlaybook(
  ruleCode: string,
  context: PlaybookQueryContext = {}
): Promise<PlaybookAdjustment[]> {
  const supabase = createSupabaseAdmin();

  try {
    // Busca regras ativas para o código de regra
    const { data: rules, error } = await supabase
      .from("iml_playbook_rules")
      .select("*")
      .eq("rule_code", ruleCode)
      .eq("active", true)
      .order("times_applied", { ascending: false });

    if (error || !rules || rules.length === 0) return [];

    // Filtra por contexto aplicável
    const applicable = rules.filter((rule) => matchesContext(rule.apply_context, context));

    return applicable.map((rule) => ({
      ruleCode: rule.rule_code,
      paramName: rule.param_name,
      adjustedValue: rule.adjusted_value,
      context: rule.apply_context,
      playbookRuleId: rule.id,
    }));
  } catch (err) {
    console.error("[Playbook] queryPlaybook error:", err);
    return []; // Silencioso — nunca bloqueia operações
  }
}

/**
 * Verifica se o contexto atual "encaixa" no contexto do ajuste.
 * Matching é por subset: todas as chaves do ajuste devem existir no contexto.
 */
function matchesContext(
  ruleContext: Record<string, unknown>,
  currentContext: PlaybookQueryContext
): boolean {
  // Contexto vazio = aplica sempre
  if (!ruleContext || Object.keys(ruleContext).length === 0) return true;

  for (const [key, value] of Object.entries(ruleContext)) {
    if (key === "time_range" && typeof value === "string" && currentContext.hour !== undefined) {
      // Contexto de horário: "14:00-16:00"
      const [start, end] = value.split("-").map((t) => parseInt(t));
      if (currentContext.hour < start || currentContext.hour >= end) return false;
    } else if (key === "day_of_week" && Array.isArray(value) && currentContext.dayOfWeek !== undefined) {
      if (!value.includes(currentContext.dayOfWeek)) return false;
    } else if (key === "company_id" && value !== currentContext.companyId) {
      return false;
    } else if (key === "desp" && value !== currentContext.desp) {
      return false;
    } else if (key === "agent_name" && value !== currentContext.agentName) {
      return false;
    }
  }

  return true;
}

// ─── Playbook Logging ───

/**
 * Registra que um ajuste do Playbook foi aplicado.
 * Usado para tracking de efetividade.
 */
export async function logPlaybookApplication(
  playbookRuleId: string,
  agentRunId: string | null,
  ruleCode: string,
  paramName: string,
  originalValue: unknown,
  appliedValue: unknown,
  context: Record<string, unknown> = {}
): Promise<void> {
  const supabase = createSupabaseAdmin();

  try {
    await supabase.from("iml_playbook_log").insert({
      playbook_rule_id: playbookRuleId,
      agent_run_id: agentRunId,
      rule_code: ruleCode,
      param_name: paramName,
      original_value: originalValue,
      applied_value: appliedValue,
      apply_context: context,
      outcome: "unknown", // Atualizado depois pela análise de resultado
    });

    // Atualiza timestamps (contador incrementado via RPC abaixo)
    await supabase
      .from("iml_playbook_rules")
      .update({
        last_applied_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", playbookRuleId);

    // Incrementa contador via SQL atômico
    try {
      await supabase.rpc("increment_playbook_applications", { p_rule_id: playbookRuleId });
    } catch {
      // Fallback se RPC não existir
    }
  } catch (err) {
    console.error("[Playbook] logApplication error:", err);
  }
}

/**
 * Atualiza o outcome de uma aplicação do Playbook.
 * Chamado após o resultado da operação ser conhecido.
 */
export async function updatePlaybookOutcome(
  agentRunId: string,
  outcome: "success" | "neutral" | "negative",
  details?: Record<string, unknown>
): Promise<void> {
  const supabase = createSupabaseAdmin();

  try {
    await supabase
      .from("iml_playbook_log")
      .update({
        outcome,
        outcome_details: details || {},
      })
      .eq("agent_run_id", agentRunId)
      .eq("outcome", "unknown");
  } catch (err) {
    console.error("[Playbook] updateOutcome error:", err);
  }
}

// ─── Admin Operations ───

/**
 * Admin aprova um insight para se tornar regra do Playbook.
 * REQUER admin_approved = true (confirmação final).
 */
export async function approveInsightToPlaybook(
  insightId: string,
  adminUserId: string,
  adminNotes?: string
): Promise<{ success: boolean; playbookRuleId?: string; error?: string }> {
  const supabase = createSupabaseAdmin();

  try {
    // Busca o insight
    const { data: insight, error } = await supabase
      .from("iml_insights")
      .select("*")
      .eq("id", insightId)
      .single();

    if (error || !insight) {
      return { success: false, error: "Insight não encontrado" };
    }

    if (insight.confidence < MIN_CONFIDENCE_FOR_APPROVAL) {
      return { success: false, error: `Confiança insuficiente: ${insight.confidence} (mínimo: ${MIN_CONFIDENCE_FOR_APPROVAL})` };
    }

    // Atualiza insight como aprovado
    await supabase
      .from("iml_insights")
      .update({
        status: "admin_approved",
        admin_approved: true,
        admin_approved_by: adminUserId,
        admin_approved_at: new Date().toISOString(),
        admin_notes: adminNotes || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", insightId);

    // Se tem parâmetros sugeridos, cria regra no Playbook
    if (insight.suggested_params && Object.keys(insight.suggested_params).length > 0) {
      const params = insight.suggested_params;
      const { data: rule, error: ruleError } = await supabase
        .from("iml_playbook_rules")
        .insert({
          rule_code: params.rule || "R0",
          param_name: params.param || "custom",
          default_value: params.current || {},
          adjusted_value: params.suggested || {},
          apply_context: params.context || {},
          source_insight_id: insightId,
          active: true,
          approved_by: adminUserId,
          approved_at: new Date().toISOString(),
          description: insight.suggested_action || insight.title,
        })
        .select("id")
        .single();

      if (ruleError) {
        console.error("[Playbook] Create rule error:", ruleError);
        return { success: true }; // Insight aprovado mas regra não criada
      }

      // Atualiza insight como aplicado
      await supabase
        .from("iml_insights")
        .update({ status: "applied" })
        .eq("id", insightId);

      return { success: true, playbookRuleId: rule?.id };
    }

    return { success: true };
  } catch (err) {
    console.error("[Playbook] approveInsight error:", err);
    return { success: false, error: "Erro interno" };
  }
}

const MIN_CONFIDENCE_FOR_APPROVAL = 0.7;

/**
 * Admin rejeita um insight.
 */
export async function rejectInsight(
  insightId: string,
  adminUserId: string,
  reason?: string
): Promise<void> {
  const supabase = createSupabaseAdmin();

  await supabase
    .from("iml_insights")
    .update({
      status: "admin_rejected",
      admin_approved: false,
      admin_approved_by: adminUserId,
      admin_approved_at: new Date().toISOString(),
      admin_notes: reason || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", insightId);
}

/**
 * Admin desativa uma regra do Playbook.
 */
export async function deactivatePlaybookRule(
  ruleId: string
): Promise<void> {
  const supabase = createSupabaseAdmin();

  await supabase
    .from("iml_playbook_rules")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", ruleId);
}

/**
 * Lista insights pendentes de aprovação do admin.
 */
export async function getPendingInsights(limit: number = 20): Promise<unknown[]> {
  const supabase = createSupabaseAdmin();

  const { data, error } = await supabase
    .from("iml_insights")
    .select("*")
    .in("status", ["pending", "ready"])
    .gte("confidence", 0.5)
    .order("confidence", { ascending: false })
    .order("evidence_count", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[Playbook] getPendingInsights error:", error);
    return [];
  }

  return data;
}
