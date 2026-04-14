/**
 * VIGI PRO — Cognitive Engine: Few-Shot Bank
 *
 * Banco de exemplos resolvidos para guiar o Cognitive Engine.
 * Cada exemplo é um caso humano ou agente que foi classificado corretamente.
 * Armazenado em R2 com índice em Supabase para consulta rápida.
 *
 * Estratégia de armazenamento:
 * - Metadados (id, demand_type, quality_score, etc.) em Supabase
 * - Conteúdo completo em R2: few_shot_bank/{demandType}/{exampleId}.json
 * - R2 é barato, queries no DB são rápidas
 *
 * Fluxo:
 * 1. saveResolvedExample() persiste novo exemplo
 * 2. getRelevantExamples() retorna melhores exemplos para um demand_type
 * 3. buildFewShotPrompt() formata exemplos para prompt Claude
 * 4. recordExampleUsage() atualiza quality_score baseado em feedback
 * 5. promoteAgentResolution() cria exemplo quando agente completa com sucesso
 * 6. resolveUnknownCase() cria exemplo quando admin resolve caso_desconhecido
 */

import { createSupabaseAdmin } from "@/lib/supabase/server";
import { uploadToR2, getFromR2 } from "@/lib/r2/client";

// ─── Types ───

export interface ResolvedExample {
  id: string;
  demand_type: string; // TipoDemanda
  original_content_summary: string; // truncated to 500 chars
  classification_confidence: number;
  resolved_by: "human" | "agent";
  resolver_id?: string; // user_id or agent_run_id
  resolution: {
    correct_demand_type: string;
    correct_actions: string[];
    notes?: string;
  };
  input_tokens_estimate: number; // to manage prompt budget
  quality_score: number; // 0-1, starts at 0.8 for human, 0.5 for agent
  usage_count: number;
  last_used_at?: string;
  created_at: string;
  company_id?: string;
}

interface FewShotExampleMetadata {
  id: string;
  demand_type: string;
  original_content_summary: string;
  classification_confidence: number;
  resolved_by: "human" | "agent";
  resolver_id: string | null;
  quality_score: number;
  usage_count: number;
  last_used_at: string | null;
  input_tokens_estimate: number;
  created_at: string;
  company_id: string | null;
}

// ─── Save Resolved Example ───

/**
 * Persiste um novo exemplo resolvido.
 * Salva metadados no Supabase, conteúdo completo em R2.
 * Operação silenciosa — erros não lançam.
 */
export async function saveResolvedExample(
  example: Omit<ResolvedExample, "id" | "created_at" | "usage_count" | "last_used_at">
): Promise<string | null> {
  const supabase = createSupabaseAdmin();
  const exampleId = `ex_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    // 1. Salva conteúdo completo em R2
    const r2Key = `few_shot_bank/${example.demand_type}/${exampleId}.json`;
    const contentBuffer = Buffer.from(JSON.stringify(example.resolution, null, 2), "utf-8");
    await uploadToR2(r2Key, contentBuffer, "application/json");

    // 2. Salva metadados em Supabase
    const metadata: FewShotExampleMetadata = {
      id: exampleId,
      demand_type: example.demand_type,
      original_content_summary: example.original_content_summary,
      classification_confidence: example.classification_confidence,
      resolved_by: example.resolved_by,
      resolver_id: example.resolver_id || null,
      quality_score: example.quality_score,
      usage_count: 0,
      last_used_at: null,
      input_tokens_estimate: example.input_tokens_estimate,
      created_at: new Date().toISOString(),
      company_id: example.company_id || null,
    };

    await supabase.from("iml_few_shot_examples").insert(metadata);

    console.log(`[FewShotBank] Example saved: ${exampleId} for ${example.demand_type}`);
    return exampleId;
  } catch (err) {
    console.error("[FewShotBank] saveResolvedExample error:", err);
    return null;
  }
}

// ─── Get Relevant Examples ───

/**
 * Busca exemplos relevantes para um demand_type.
 * Ordena por quality_score descendente.
 * Limita por token budget (padrão 2000, máx 5 exemplos).
 * Busca conteúdo completo de R2.
 */
export async function getRelevantExamples(
  demandType: string,
  maxTokens: number = 2000,
  maxExamples: number = 5
): Promise<ResolvedExample[]> {
  const supabase = createSupabaseAdmin();

  try {
    // 1. Busca metadados, ordenado por quality_score desc
    const { data: metadatas, error } = await supabase
      .from("iml_few_shot_examples")
      .select("*")
      .eq("demand_type", demandType)
      .order("quality_score", { ascending: false })
      .limit(maxExamples);

    if (error || !metadatas) {
      console.error("[FewShotBank] getRelevantExamples query error:", error);
      return [];
    }

    const examples: ResolvedExample[] = [];
    let tokensUsed = 0;

    // 2. Busca conteúdo de R2 respeitando budget
    for (const metadata of metadatas) {
      if (tokensUsed + metadata.input_tokens_estimate > maxTokens) {
        break; // Orçamento esgotado
      }

      try {
        const r2Key = `few_shot_bank/${demandType}/${metadata.id}.json`;
        const body = await getFromR2(r2Key);
        const text = await body?.transformToString();

        if (!text) continue;

        const resolution = JSON.parse(text);
        examples.push({
          id: metadata.id,
          demand_type: metadata.demand_type,
          original_content_summary: metadata.original_content_summary,
          classification_confidence: metadata.classification_confidence,
          resolved_by: metadata.resolved_by,
          resolver_id: metadata.resolver_id || undefined,
          resolution,
          input_tokens_estimate: metadata.input_tokens_estimate,
          quality_score: metadata.quality_score,
          usage_count: metadata.usage_count,
          last_used_at: metadata.last_used_at || undefined,
          created_at: metadata.created_at,
          company_id: metadata.company_id || undefined,
        });

        tokensUsed += metadata.input_tokens_estimate;
      } catch (err) {
        console.error(`[FewShotBank] Failed to load example ${metadata.id}:`, err);
        continue;
      }
    }

    return examples;
  } catch (err) {
    console.error("[FewShotBank] getRelevantExamples error:", err);
    return [];
  }
}

// ─── Build Few-Shot Prompt ───

/**
 * Formata exemplos como seção de prompt para Claude.
 * Padrão: lista exemplos com input/output clara para few-shot learning.
 */
export function buildFewShotPrompt(examples: ResolvedExample[]): string {
  if (examples.length === 0) {
    return "";
  }

  let prompt = "\n## Exemplos de Resoluções Anteriores\n\n";
  prompt += "Aqui estão exemplos de demandas similares que foram resolvidas com sucesso:\n\n";

  for (let i = 0; i < examples.length; i++) {
    const ex = examples[i];
    prompt += `### Exemplo ${i + 1}: ${ex.demand_type}\n`;
    prompt += `**Confiança de Classificação:** ${(ex.classification_confidence * 100).toFixed(0)}%\n`;
    prompt += `**Resolvido por:** ${ex.resolved_by === "human" ? "Admin" : "Agente"}\n`;
    if (ex.original_content_summary) {
      prompt += `**Resumo Original:** ${ex.original_content_summary.substring(0, 200)}...\n`;
    }
    prompt += `**Tipo Correto:** ${ex.resolution.correct_demand_type}\n`;
    prompt += `**Ações:** ${ex.resolution.correct_actions.join(", ")}\n`;
    if (ex.resolution.notes) {
      prompt += `**Notas:** ${ex.resolution.notes}\n`;
    }
    prompt += "\n";
  }

  prompt += "Use estes exemplos como referência para resolver demandas similares.\n";

  return prompt;
}

// ─── Record Example Usage ───

/**
 * Registra que um exemplo foi usado e atualiza quality_score.
 * wasHelpful: true → +0.05 ao score
 * wasHelpful: false → -0.1 ao score (mais penalizante)
 */
export async function recordExampleUsage(exampleId: string, wasHelpful: boolean): Promise<void> {
  const supabase = createSupabaseAdmin();

  try {
    const { data: example, error: fetchError } = await supabase
      .from("iml_few_shot_examples")
      .select("quality_score, usage_count")
      .eq("id", exampleId)
      .single();

    if (fetchError || !example) {
      console.error("[FewShotBank] recordExampleUsage fetch error:", fetchError);
      return;
    }

    const scoreDelta = wasHelpful ? 0.05 : -0.1;
    const newScore = Math.max(0, Math.min(1, example.quality_score + scoreDelta)); // Clamp [0, 1]

    await supabase
      .from("iml_few_shot_examples")
      .update({
        quality_score: newScore,
        usage_count: example.usage_count + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", exampleId);

    console.log(
      `[FewShotBank] Example ${exampleId} usage recorded: helpful=${wasHelpful}, new_score=${newScore.toFixed(2)}`
    );
  } catch (err) {
    console.error("[FewShotBank] recordExampleUsage error:", err);
  }
}

// ─── Promote Agent Resolution ───

/**
 * Quando um agente completa uma demanda com sucesso, cria automaticamente
 * um exemplo few-shot com quality_score inicial de 0.5.
 * Permite que sucessos do agente guiem futuras análises.
 */
export async function promoteAgentResolution(
  agentRunId: string,
  demandType: string,
  actions: string[],
  contentSummary?: string
): Promise<string | null> {
  const example: Omit<ResolvedExample, "id" | "created_at" | "usage_count" | "last_used_at"> = {
    demand_type: demandType,
    original_content_summary: contentSummary || `Agent resolution for ${demandType}`,
    classification_confidence: 0.85, // Presume confiança adequada se agente completou
    resolved_by: "agent",
    resolver_id: agentRunId,
    resolution: {
      correct_demand_type: demandType,
      correct_actions: actions,
      notes: `Auto-promoted from agent run ${agentRunId}`,
    },
    input_tokens_estimate: 500, // Estimativa padrão
    quality_score: 0.5, // Score inicial moderado para exemplos de agente
  };

  return saveResolvedExample(example);
}

// ─── Resolve Unknown Case ───

/**
 * Quando um admin resolve um caso_desconhecido (caso que o sistema não soube classificar),
 * cria automaticamente um exemplo few-shot com quality_score alto (0.9).
 * Estes são casos valiosos que melhoram o sistema.
 */
export async function resolveUnknownCase(
  workflowId: string,
  correctDemandType: string,
  correctActions: string[],
  resolvedBy: string,
  contentSummary?: string
): Promise<string | null> {
  const example: Omit<ResolvedExample, "id" | "created_at" | "usage_count" | "last_used_at"> = {
    demand_type: correctDemandType,
    original_content_summary: contentSummary || `Unknown case resolved to ${correctDemandType}`,
    classification_confidence: 1.0, // Admin confirmou 100%
    resolved_by: "human",
    resolver_id: resolvedBy,
    resolution: {
      correct_demand_type: correctDemandType,
      correct_actions: correctActions,
      notes: `Human resolution of unknown case from workflow ${workflowId}`,
    },
    input_tokens_estimate: 600, // Estimativa para casos complexos
    quality_score: 0.9, // Score alto — estes são resoluções valiosas
  };

  return saveResolvedExample(example);
}

/**
 * Retorna estatísticas do banco few-shot (usado para dashboard).
 */
export async function getFewShotBankStats(): Promise<{
  totalExamples: number;
  examplesByDemandType: Record<string, number>;
  averageQualityScore: number;
  totalUsageCount: number;
} | null> {
  const supabase = createSupabaseAdmin();

  try {
    const { data, error } = await supabase
      .from("iml_few_shot_examples")
      .select("demand_type, quality_score, usage_count");

    if (error || !data) {
      console.error("[FewShotBank] getFewShotBankStats error:", error);
      return null;
    }

    const totalExamples = data.length;
    const examplesByDemandType: Record<string, number> = {};
    let totalQualityScore = 0;
    let totalUsageCount = 0;

    for (const ex of data) {
      examplesByDemandType[ex.demand_type] = (examplesByDemandType[ex.demand_type] ?? 0) + 1;
      totalQualityScore += ex.quality_score;
      totalUsageCount += ex.usage_count;
    }

    const averageQualityScore = totalExamples > 0 ? totalQualityScore / totalExamples : 0;

    return {
      totalExamples,
      examplesByDemandType,
      averageQualityScore,
      totalUsageCount,
    };
  } catch (err) {
    console.error("[FewShotBank] getFewShotBankStats error:", err);
    return null;
  }
}
