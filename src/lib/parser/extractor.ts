import { getAnthropicClient, AI_MODELS, AI_THRESHOLDS } from "@/lib/ai/client";
import { EXTRACTOR_SYSTEM_PROMPT, EXTRACTION_PROMPTS } from "@/lib/ai/prompts";

/**
 * ETAPA 2: Extração detalhada com Sonnet
 * Após classificação, extrai dados estruturados conforme o tipo de demanda
 * PRD Seção 3.3 — Parser aceita formulários desorganizados e estrutura
 *
 * Usa prompt caching no system prompt estático → ~90% economia
 */
export async function extractData(
  tipoDemanda: string,
  subject: string,
  bodyText: string
): Promise<Record<string, unknown>> {
  const prompt = EXTRACTION_PROMPTS[tipoDemanda];
  if (!prompt) {
    return { tipo_demanda: tipoDemanda, raw_subject: subject };
  }

  const anthropic = getAnthropicClient();

  const response = await anthropic.messages.create({
    model: AI_MODELS.complex,
    max_tokens: AI_THRESHOLDS.extractionMaxTokens,
    system: [
      {
        type: "text",
        text: EXTRACTOR_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" }, // 5min TTL
      },
    ],
    messages: [
      {
        role: "user",
        content: `TIPO DE DEMANDA: ${tipoDemanda}

INSTRUÇÕES DE EXTRAÇÃO:
${prompt}

EMAIL:
Assunto: ${subject}
Corpo:
${bodyText.slice(0, 4000)}`,
      },
    ],
  });

  try {
    const text =
      response.content[0].type === "text" ? response.content[0].text : "{}";
    return JSON.parse(text);
  } catch {
    return {
      erro: "Falha na extração",
      raw_subject: subject,
      raw_body_preview: bodyText.slice(0, 500),
    };
  }
}
