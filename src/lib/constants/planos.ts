/**
 * Constantes de Planos de Preços
 */

export const PLANOS = [
  { value: "starter", label: "Starter — R$ 497/mês" },
  { value: "professional", label: "Professional — R$ 997/mês" },
  { value: "enterprise", label: "Enterprise — R$ 2.997/mês" },
  { value: "custom", label: "Custom — Negociado" },
];

export const PLANO_VALORES: Record<string, number> = {
  starter: 497,
  professional: 997,
  enterprise: 2997,
  custom: 0,
};

export type PlanoType = "starter" | "professional" | "enterprise" | "custom";
