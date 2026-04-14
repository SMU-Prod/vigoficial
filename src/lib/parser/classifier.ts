import { getAnthropicClient, AI_MODELS, AI_THRESHOLDS } from "@/lib/ai/client";
import { CLASSIFIER_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { createSupabaseAdmin } from "@/lib/supabase/server";

interface ClassificationResult {
  tipo_demanda: string;
  confidence: number;
  urgente: boolean;
  dados_extraidos: Record<string, unknown>;
}

/**
 * ETAPA 1: Classificação rápida com Haiku
 * Identifica o tipo de demanda e se é urgente
 * PRD Seção 3.3 — Parser IA de Emails
 *
 * Usa prompt caching (5min TTL) no system prompt estático → ~90% economia
 */
export async function classifyEmail(
  subject: string,
  bodyText: string,
  fromEmail: string
): Promise<ClassificationResult> {
  const anthropic = getAnthropicClient();

  // Busca keywords do banco para contexto dinâmico
  const supabase = createSupabaseAdmin();
  const { data: keywords } = await supabase
    .from("parser_keywords")
    .select("tipo_demanda, keywords, acao_automatica")
    .eq("ativo", true);

  const keywordContext = (keywords || [])
    .map((k) => `- ${k.tipo_demanda}: ${k.keywords.join(", ")}`)
    .join("\n");

  const response = await anthropic.messages.create({
    model: AI_MODELS.fast,
    max_tokens: AI_THRESHOLDS.classificationMaxTokens,
    system: [
      {
        type: "text",
        text: CLASSIFIER_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" }, // 5min TTL — reutiliza entre chamadas
      },
    ],
    messages: [
      {
        role: "user",
        content: `KEYWORDS ADICIONAIS DO BANCO:
${keywordContext}

EMAIL:
De: ${fromEmail}
Assunto: ${subject}
Corpo: ${bodyText.slice(0, 2000)}`,
      },
    ],
  });

  try {
    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    const parsed = JSON.parse(text);

    // Regra R7: Confidence < 0.70 → caso_desconhecido → escala humano
    if (parsed.confidence < AI_THRESHOLDS.classificationConfidence) {
      parsed.tipo_demanda = "caso_desconhecido";
    }

    return {
      tipo_demanda: parsed.tipo_demanda || "caso_desconhecido",
      confidence: parsed.confidence || 0,
      urgente: parsed.urgente || false,
      dados_extraidos: { resumo: parsed.resumo },
    };
  } catch {
    return {
      tipo_demanda: "caso_desconhecido",
      confidence: 0,
      urgente: false,
      dados_extraidos: { erro: "Falha ao parsear resposta do classificador" },
    };
  }
}
