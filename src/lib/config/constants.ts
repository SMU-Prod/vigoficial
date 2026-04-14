/**
 * VIG PRO - Constantes Centralizadas
 * Todos os valores que antes eram hardcoded agora vivem aqui ou em env vars.
 */

import { env } from "@/lib/config/env"; // OPS-02

// --- Email (domínio verificado no Resend: vigconsultoria.com — SEM "i") ---
export const EMAIL_DOMAIN = "vigconsultoria.com";
export const EMAIL_FROM_ATENDIMENTO = env.EMAIL_FROM_ATENDIMENTO || `VIG Consultoria <atendimento@${EMAIL_DOMAIN}>`;
export const EMAIL_FROM_VIGIPRO = env.EMAIL_FROM_VIGIPRO || `VIG PRO <vigipro@${EMAIL_DOMAIN}>`;
export const EMAIL_FROM_ADMIN = env.EMAIL_FROM_ADMIN || `Admin VIG PRO <admin@${EMAIL_DOMAIN}>`;
export const EMAIL_ATENDIMENTO = `atendimento@${EMAIL_DOMAIN}`;
export const EMAIL_ADMIN = `admin@${EMAIL_DOMAIN}`;
export const EMAIL_VIGIPRO = `vigipro@${EMAIL_DOMAIN}`;
// Legacy alias (para manter compatibilidade)
export const EMAIL_FROM_DEFAULT = EMAIL_FROM_ATENDIMENTO;
export const EMAIL_EQUIPE = EMAIL_ATENDIMENTO;

// --- Email Assinatura ---
export const EMAIL_SIGNATURE = "Equipe VIG Consultoria · Compliance em Segurança Privada";
export const EMAIL_FOOTER = `© ${new Date().getFullYear()} VIG Consultoria · CNPJ 29.693.164/0001-23 · Comunicação confidencial`;

// --- Enderecos proibidos em CC externo ---
export const INTERNAL_ONLY_EMAILS = [
  `admin@${EMAIL_DOMAIN}`,
  `vigipro@${EMAIL_DOMAIN}`,
];

// --- URLs Externas (governo) ---
export const GESP_PORTAL_URL = env.GESP_PORTAL_URL;
export const GESP_URL = env.GESP_URL;
export const GOV_BR_LOGIN_URL = env.GOV_BR_LOGIN_URL;
export const DOU_BASE_URL = env.DOU_BASE_URL;

// --- Billing ---
export const DEFAULT_ESSENCIAL_PRICE = 1500; // R$1.500/mês - plano essencial
export const ADICIONAL_FILIAL_PRICE = 1000; // R$1.000/mês por filial extra

// --- BullMQ Limites ---
export const WORKER_LIMITS = {
  emailSend: { max: 5, duration: 1000 }, // Resend: 5 req/s
  gespSync: { maxConcurrent: 3 },        // Regra R5: max 3 browsers
  gespBatch: { maxPerSubmission: 999 },   // Regra R4: max 999 tarefas
} as const;

// --- Compliance ---
export const ALERT_THRESHOLDS = {
  critical: 5,      // 0-5 dias → Template F
  urgent: 15,       // 5-15 dias → Template C
  action: 30,       // 15-30 dias → Template C
  attention: 60,    // 30-60 dias → Template C
  informative: 90,  // 60-90 dias → Template C
} as const;

// --- GPS/Frota ---
export const MAINTENANCE_KM = {
  troca_oleo: { interval: 10000, alertBefore: 1000 },
  troca_pneu: { interval: 40000, alertBefore: 3000 },
  pastilha_freio: { interval: 30000, alertBefore: 2000 },
  correia_dentada: { interval: 60000, alertBefore: 5000 },
  revisao_geral: { interval: 20000, alertBefore: 2000 },
} as const;

// --- Prospect Scoring ---
export const PROSPECT_SCORE = {
  cnae_exact: 30,       // CNAE 8011101
  cnae_related: 20,     // CNAE 801x/802x
  has_email: 15,
  has_phone: 10,
  capital_high: 20,     // > R$500k
  capital_med: 10,      // > R$100k
  capital_low: 5,       // > R$10k
  recent_company: 10,   // Abertura >= 2020
  priority_uf: 5,       // SP, RJ, MG, PR, RS, BA, DF
  has_contact_name: 5,
  has_contact_email: 5,
} as const;

// ─── GESP Browser Timing ──────────────────────────────────────────
export const GESP_TIMING = {
  /** Base delay between GESP page navigations (ms) */
  NAV_DELAY_BASE: 1500,
  /** Random jitter added to nav delay (ms) */
  NAV_DELAY_JITTER: 2500,
  /** Short action delay (ms) */
  ACTION_DELAY_SHORT: 500,
  /** Medium action delay (ms) */
  ACTION_DELAY_MEDIUM: 1000,
  /** Long action delay (ms) */
  ACTION_DELAY_LONG: 2000,
  /** Batch sync pause between companies (ms) */
  BATCH_SYNC_PAUSE: 5000,
  /** Default viewport width */
  VIEWPORT_WIDTH: 1366,
  /** Default viewport height */
  VIEWPORT_HEIGHT: 768,
} as const;

// ─── Fleet Maintenance Thresholds ─────────────────────────────────
export const FLEET_THRESHOLDS = {
  troca_oleo: { km: 10000, alertaAntes: 1000 },
  troca_pneu: { km: 40000, alertaAntes: 3000 },
  pastilha_freio: { km: 30000, alertaAntes: 2000 },
} as const;

// ─── Prospect Scoring Weights ─────────────────────────────────────
export const PROSPECT_SCORING = {
  /** Weight for company size factor */
  WEIGHT_SIZE: 30,
  /** Weight for segment match */
  WEIGHT_SEGMENT: 20,
  /** Weight for location proximity */
  WEIGHT_LOCATION: 15,
  /** Weight for engagement signals */
  WEIGHT_ENGAGEMENT: 10,
} as const;

// ─── AI Configuration ─────────────────────────────────────────────
export const AI_CONFIG = {
  /** Default max tokens for DOU prospector */
  DOU_MAX_TOKENS: 1000,
  /** Default backoff delay for retries (ms) */
  RETRY_BACKOFF_DELAY: 60000,
} as const;

// ─── UI Z-Index Layers ────────────────────────────────────────────
export const Z_INDEX = {
  dropdown: 1000,
  sticky: 1020,
  fixed: 1030,
  modal_backdrop: 1050,
  modal: 1060,
  tooltip: 1070,
} as const;
