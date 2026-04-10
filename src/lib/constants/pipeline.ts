/**
 * Constantes de Pipeline de Prospecção (CRM)
 * Inspirado em Pipedrive / HubSpot / Salesforce
 */

import type { LeadStatus, LeadTemperatura } from "@/types/database";

export const PIPELINE_STAGES: {
  key: LeadStatus;
  label: string;
  emoji: string;
  color: string;
  bg: string;
  border: string;
  accent: string;
  probability: number;
}[] = [
  {
    key: "novo",
    label: "Novos",
    emoji: "📥",
    color: "text-[var(--text-secondary)]",
    bg: "bg-[var(--bg-tertiary)]",
    border: "border-[var(--border-primary)]",
    accent: "bg-[var(--text-tertiary)]",
    probability: 5,
  },
  {
    key: "contatado",
    label: "Contatados",
    emoji: "📞",
    color: "text-[var(--vigi-navy)]",
    bg: "bg-[var(--bg-secondary)]",
    border: "border-[var(--border-primary)]",
    accent: "bg-[var(--vigi-navy-light)]",
    probability: 15,
  },
  {
    key: "qualificado",
    label: "Qualificados",
    emoji: "✅",
    color: "text-[var(--vigi-navy)]",
    bg: "bg-[var(--bg-secondary)]",
    border: "border-[var(--border-primary)]",
    accent: "bg-[var(--vigi-navy)]",
    probability: 30,
  },
  {
    key: "proposta_enviada",
    label: "Proposta",
    emoji: "📄",
    color: "text-[var(--vigi-navy)]",
    bg: "bg-[var(--bg-secondary)]",
    border: "border-[var(--border-primary)]",
    accent: "bg-[var(--vigi-gold)]",
    probability: 50,
  },
  {
    key: "negociacao",
    label: "Negociação",
    emoji: "🤝",
    color: "text-[var(--vigi-navy)]",
    bg: "bg-[var(--bg-secondary)]",
    border: "border-[var(--border-primary)]",
    accent: "bg-[var(--vigi-gold)]",
    probability: 75,
  },
  {
    key: "ganho",
    label: "Ganhos",
    emoji: "🏆",
    color: "text-[var(--status-success)]",
    bg: "bg-[var(--bg-secondary)]",
    border: "border-[var(--border-primary)]",
    accent: "bg-[var(--status-success)]",
    probability: 100,
  },
  {
    key: "perdido",
    label: "Perdidos",
    emoji: "❌",
    color: "text-[var(--text-tertiary)]",
    bg: "bg-[var(--bg-secondary)]",
    border: "border-[var(--border-primary)]",
    accent: "bg-[var(--status-danger)]",
    probability: 0,
  },
];

export const STATUS_MAP = Object.fromEntries(
  PIPELINE_STAGES.map((s) => [s.key, s])
) as Record<
  LeadStatus,
  (typeof PIPELINE_STAGES)[number]
>;

export const ACTIVE_STAGES = PIPELINE_STAGES.filter(
  (s) => s.key !== "perdido" && s.key !== "ganho"
);

export const NEXT_STATUS: Partial<Record<LeadStatus, LeadStatus>> = {
  novo: "contatado",
  contatado: "qualificado",
  qualificado: "proposta_enviada",
  proposta_enviada: "negociacao",
  negociacao: "ganho",
};

export const TEMP_CONFIG: Record<
  LeadTemperatura,
  { label: string; color: string; dot: string; bg: string }
> = {
  frio: {
    label: "Frio",
    color: "text-[var(--status-info)]",
    dot: "bg-[var(--status-info)]",
    bg: "bg-[var(--status-info-bg)]",
  },
  morno: {
    label: "Morno",
    color: "text-[var(--status-warning)]",
    dot: "bg-[var(--status-warning)]",
    bg: "bg-[var(--status-warning-bg)]",
  },
  quente: {
    label: "Quente",
    color: "text-[var(--status-danger)]",
    dot: "bg-[var(--status-danger)]",
    bg: "bg-[var(--status-danger-bg)]",
  },
};

export const ACTIVITY_TYPES = [
  { value: "ligacao", label: "📞 Ligação" },
  { value: "email", label: "📧 Email" },
  { value: "reuniao", label: "📅 Reunião" },
  { value: "whatsapp", label: "💬 WhatsApp" },
  { value: "nota", label: "📝 Nota" },
  { value: "proposta", label: "📑 Proposta" },
  { value: "followup", label: "🔄 Follow-up" },
];

// Deal rotting: dias sem contato para considerar "esfriando"
export const ROTTING_DAYS = { warning: 7, danger: 14 };
