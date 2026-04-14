/**
 * Constantes de Planos de Preços — VIG PRO
 *
 * Planos atualizados conforme requisitos:
 * - Essencial: R$ 1.500/mês
 * - Profissional: R$ 3.000/mês
 * - Enterprise: R$ 6.000/mês
 * - Custom: Negociado
 *
 * Adicional por filial: R$ 1.000/mês
 */

export const ADICIONAL_FILIAL = 1000; // R$ 1.000/mês por filial extra

export const PLANOS = [
  { value: "essencial", label: "Essencial — R$ 1.500/mês" },
  { value: "profissional", label: "Profissional — R$ 3.000/mês" },
  { value: "enterprise", label: "Enterprise — R$ 6.000/mês" },
  { value: "custom", label: "Custom — Negociado" },
] as const;

export const PLANO_VALORES: Record<string, number> = {
  essencial: 1500,
  profissional: 3000,
  enterprise: 6000,
  custom: 0,
};

export type PlanoType = "essencial" | "profissional" | "enterprise" | "custom";

/**
 * Calcula valor total do plano considerando filiais adicionais
 * A primeira filial (matriz) está incluída no plano base.
 */
export function calcularValorPlano(plano: PlanoType, totalFiliais: number): number {
  const valorBase = PLANO_VALORES[plano] || 0;
  const filiaisExtras = Math.max(0, totalFiliais - 1);
  return valorBase + filiaisExtras * ADICIONAL_FILIAL;
}
