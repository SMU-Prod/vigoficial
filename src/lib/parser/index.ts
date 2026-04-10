import { classifyEmail } from "./classifier";
import { extractData } from "./extractor";

export interface ParseResult {
  tipo_demanda: string;
  confidence: number;
  urgente: boolean;
  dados_extraidos: Record<string, unknown>;
}

/**
 * Pipeline completo do Parser IA
 * 1. Classifica com Haiku (rápido/barato)
 * 2. Extrai dados com Sonnet (detalhado)
 * PRD Seção 3.3
 */
export async function parseEmail(
  subject: string,
  bodyText: string,
  fromEmail: string
): Promise<ParseResult> {
  // Etapa 1: Classificação
  const classification = await classifyEmail(subject, bodyText, fromEmail);

  // Caso desconhecido: não precisa extrair
  if (classification.tipo_demanda === "caso_desconhecido") {
    return classification;
  }

  // Etapa 2: Extração detalhada
  const extracted = await extractData(
    classification.tipo_demanda,
    subject,
    bodyText
  );

  return {
    ...classification,
    dados_extraidos: {
      ...classification.dados_extraidos,
      ...extracted,
    },
  };
}

export { classifyEmail } from "./classifier";
export { extractData } from "./extractor";
