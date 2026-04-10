import { Queue } from "bullmq";
import { redisConnection } from "@/lib/redis/connection";

/**
 * Lazy Queue Factory — evita conexão Redis no import
 *
 * Queue é criada apenas no primeiro uso, não no import do módulo.
 * Isso elimina ECONNREFUSED em cascata quando Redis não está disponível
 * (dev local sem Docker, testes, SSR de páginas que não usam filas).
 */

const cache = new Map<string, Queue>();

function getOrCreate(name: string): Queue {
  let q = cache.get(name);
  if (!q) {
    q = new Queue(name, {
      connection: redisConnection,
      // FIX: IA-02 — Dead Letter Queue configuration for failed jobs
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      },
    });
    cache.set(name, q);
  }
  return q;
}

// FIX: IA-02 — Dead Letter Queue factory for failed jobs
export function getDLQueue(): Queue {
  return getOrCreate("dlq");
}

// Filas alinhadas com a Seção 6.7 do PRD
export const getDouQueue = () => getOrCreate("dou");
export const getEmailReadQueue = () => getOrCreate("email-read");
export const getGespSyncQueue = () => getOrCreate("gesp-sync");
export const getGespActionQueue = () => getOrCreate("gesp-action");
export const getComplianceQueue = () => getOrCreate("compliance");
export const getFleetQueue = () => getOrCreate("fleet");
export const getEmailSendQueue = () => getOrCreate("email-send");
export const getBillingQueue = () => getOrCreate("billing");
export const getComunicadorAlertsQueue = () => getOrCreate("comunicador-alerts");
export const getInsightDistillQueue = () => getOrCreate("insight-distill");
export const getProspectorQueue    = () => getOrCreate("prospector");

/** Retorna todas as filas ativas (instanciando se necessário) */
export function getAllQueues(): Queue[] {
  return [
    getDouQueue(),
    getEmailReadQueue(),
    getGespSyncQueue(),
    getGespActionQueue(),
    getComplianceQueue(),
    getFleetQueue(),
    getEmailSendQueue(),
    getBillingQueue(),
    getComunicadorAlertsQueue(),
    getInsightDistillQueue(),
    getProspectorQueue(),
    getDLQueue(),
  ];
}
