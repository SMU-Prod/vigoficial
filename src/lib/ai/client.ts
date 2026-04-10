/**
 * VIGI - Singleton do Anthropic SDK
 * Centraliza criação do client e modelos usados.
 * PRD Seção 3.3 — Todos os módulos IA importam daqui.
 *
 * OPS-02: Uses validated env module instead of direct process.env
 */
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/config/env";

// Singleton — reutilizado em todo o projeto
let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return _client;
}

// Modelos centralizados — alterar aqui atualiza todo o projeto
const MODEL_FAST = env.AI_MODEL_FAST;
const MODEL_COMPLEX = env.AI_MODEL_COMPLEX;
const MODEL_ADVANCED = env.AI_MODEL_ADVANCED;

export const AI_MODELS = {
  /** Haiku: classificação rápida, parsing DOU, tarefas < 500 tokens */
  fast: MODEL_FAST,
  /** Sonnet: extração detalhada, decisões complexas, agentes */
  complex: MODEL_COMPLEX,
  /** Opus: decisões críticas, orquestração (opcional) */
  advanced: MODEL_ADVANCED,

  // Aliases used by agent modules
  HAIKU: MODEL_FAST,
  SONNET: MODEL_COMPLEX,
  OPUS: MODEL_ADVANCED,
};

// Limites de confiança — PRD Regra R7
export const AI_THRESHOLDS = {
  /** Abaixo disso → caso_desconhecido → escala humano */
  classificationConfidence: 0.70,
  /** Máximo de tokens para classificação */
  classificationMaxTokens: 500,
  /** Máximo de tokens para extração */
  extractionMaxTokens: 1500,

  // Aliases used by agent modules
  CONFIDENCE_THRESHOLD: 0.70,
  MAX_CLASSIFICATION_TOKENS: 500,
  MAX_EXTRACTION_TOKENS: 1500,
};
