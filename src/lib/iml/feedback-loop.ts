/**
 * VIGI PRO — Institutional Memory Layer: Feedback Loop
 *
 * Usa sinais de aprovação/rejeição do admin para recalibrar o Pattern Distiller.
 * Feedback loop permite que o sistema aprenda quais padrões são úteis vs. ignorados.
 *
 * Fluxo:
 * 1. Admin aprova/rejeita insights do Pattern Distiller
 * 2. recordInsightFeedback() persiste o feedback
 * 3. getDistillerCalibration() calcula accuracy por tipo de padrão
 * 4. getCalibrationPromptContext() gera hint para Claude interpretar melhor próximos padrões
 * 5. shouldAutoApprove() permite auto-approve de insights altamente confiáveis
 */

import { createSupabaseAdmin } from "@/lib/supabase/server";

// ─── Types ───

export interface InsightFeedback {
  insight_id: string;
  action: "approved" | "rejected" | "modified";
  admin_id: string;
  reason?: string;
  modified_suggestion?: Record<string, unknown>;
  timestamp: string;
}

export interface DistillerCalibration {
  pattern_type: string; // timing, performance, correlation, anomaly
  accuracy_score: number; // 0-1 based on feedback history
  total_insights: number;
  approved_count: number;
  rejected_count: number;
  modified_count: number;
  last_calibrated: string;
}

// ─── Record Feedback ───

/**
 * Registra feedback do admin sobre um insight do Pattern Distiller.
 * Persiste em tabela iml_insight_feedback para análise de calibração.
 * Operação silenciosa — erros não são lançados.
 */
export async function recordInsightFeedback(feedback: InsightFeedback): Promise<void> {
  const supabase = createSupabaseAdmin();

  try {
    await supabase.from("iml_insight_feedback").insert({
      insight_id: feedback.insight_id,
      action: feedback.action,
      admin_id: feedback.admin_id,
      reason: feedback.reason || null,
      modified_suggestion: feedback.modified_suggestion || null,
      created_at: feedback.timestamp,
    });

    console.log(`[FeedbackLoop] Feedback recorded for insight ${feedback.insight_id}: ${feedback.action}`);
  } catch (err) {
    console.error("[FeedbackLoop] recordInsightFeedback error:", err);
    // Silencioso — nunca bloqueia operações
  }
}

// ─── Calibration Calculation ───

/**
 * Calcula calibração (accuracy score) do Pattern Distiller por tipo de padrão.
 * Lê histórico de feedback e calcula estatísticas.
 * Retorna array com calibração por pattern_type.
 */
export async function getDistillerCalibration(): Promise<DistillerCalibration[]> {
  const supabase = createSupabaseAdmin();

  try {
    // Busca feedback agrupado por tipo de padrão
    const { data: feedbackData, error } = await supabase
      .from("iml_insight_feedback")
      .select("insight_id, action, created_at, iml_insights(pattern_type)");

    if (error || !feedbackData) {
      console.error("[FeedbackLoop] getDistillerCalibration error:", error);
      return [];
    }

    // Agrupa por pattern_type
    const calibrations: Record<string, DistillerCalibration> = {};

    for (const feedback of feedbackData) {
      const insights = feedback.iml_insights as unknown as Record<string, unknown> | null;
      const patternType = (insights?.pattern_type as string) || "unknown";
      if (!calibrations[patternType]) {
        calibrations[patternType] = {
          pattern_type: patternType,
          accuracy_score: 0,
          total_insights: 0,
          approved_count: 0,
          rejected_count: 0,
          modified_count: 0,
          last_calibrated: new Date().toISOString(),
        };
      }

      calibrations[patternType].total_insights++;
      if (feedback.action === "approved") {
        calibrations[patternType].approved_count++;
      } else if (feedback.action === "rejected") {
        calibrations[patternType].rejected_count++;
      } else if (feedback.action === "modified") {
        calibrations[patternType].modified_count++;
      }
    }

    // Calcula accuracy_score: (approved + 0.5 * modified) / total
    for (const key in calibrations) {
      const cal = calibrations[key];
      cal.accuracy_score = cal.total_insights > 0
        ? (cal.approved_count + 0.5 * cal.modified_count) / cal.total_insights
        : 0;
    }

    return Object.values(calibrations);
  } catch (err) {
    console.error("[FeedbackLoop] getDistillerCalibration error:", err);
    return [];
  }
}

// ─── Calibration Prompt Context ───

/**
 * Gera uma seção de prompt que informa ao Pattern Distiller
 * quais tipos de insights foram úteis vs. rejeitados.
 * Usado para auto-corrigir comportamento em futuras distilações.
 */
export async function getCalibrationPromptContext(): Promise<string> {
  const calibrations = await getDistillerCalibration();

  if (calibrations.length === 0) {
    return ""; // Sem feedback historicamente
  }

  let context = "\n## Calibração Histórica do Padrão Distiller\n\n";
  context += "Com base em feedback anterior dos admins, estes tipos de padrões têm as seguintes taxa de aprovação:\n\n";

  for (const cal of calibrations.sort((a, b) => b.accuracy_score - a.accuracy_score)) {
    const percentage = (cal.accuracy_score * 100).toFixed(0);
    context += `- **${cal.pattern_type}**: ${percentage}% aprovação (${cal.approved_count}/${cal.total_insights} insights)`;
    if (cal.modified_count > 0) {
      context += ` [${cal.modified_count} modificados]`;
    }
    context += "\n";
  }

  context += "\n**Instruções:** Use esta informação para refinar quais padrões extrair e como apresentá-los.\n";
  context += "Padrões com alta aprovação devem ser mantidos. Padrões com baixa aprovação devem ser revisados ou não extraídos.\n";

  return context;
}

// ─── Auto-Approval Decision ───

/**
 * Decide se um insight pode ser auto-aprovado (sem intervenção admin).
 * Retorna true se o pattern_type tem:
 * - > 90% approval rate histórico
 * - E confidence atual >= 0.95
 *
 * Permite gradualmente mais autonomia conforme o sistema aprende.
 */
export async function shouldAutoApprove(insightType: string, confidence: number): Promise<boolean> {
  if (confidence < 0.95) {
    return false; // Confiança insuficiente
  }

  const calibrations = await getDistillerCalibration();
  const calibration = calibrations.find((c) => c.pattern_type === insightType);

  if (!calibration || calibration.total_insights < 5) {
    return false; // Sem histórico suficiente (mínimo 5 insights)
  }

  return calibration.accuracy_score >= 0.9; // > 90% aprovação histórica
}

/**
 * Retorna perfil de calibração para o padrão específico.
 * Útil para dashboard admin ver o que está funcionando.
 */
export async function getPatternCalibrationProfile(patternType: string): Promise<DistillerCalibration | null> {
  const calibrations = await getDistillerCalibration();
  return calibrations.find((c) => c.pattern_type === patternType) || null;
}
