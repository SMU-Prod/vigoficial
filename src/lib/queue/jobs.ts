import {
  getDouQueue,
  getEmailReadQueue,
  getGespSyncQueue,
  getComplianceQueue,
  getFleetQueue,
  getEmailSendQueue,
  getBillingQueue,
  getComunicadorAlertsQueue,
  getDLQueue,
  getProspectorQueue,
} from "./queues";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import type { EmailTemplateId, EmailMode } from "@/types/database";

// --- Job defaults por tipo (Seção 6.7 do PRD) ---

const GESP_RETRY = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 3 * 60 * 1000 }, // 3min, 6min, 12min...
};

const DEFAULT_RETRY = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 30_000 },
};

// --- Adicionar jobs às filas ---

export async function addDouJob() {
  return getDouQueue().add("parse-dou", { date: new Date().toISOString() }, {
    ...DEFAULT_RETRY,
    removeOnComplete: { age: 86400 },
    removeOnFail: { age: 604800 },
  });
}

export async function addEmailReadJob(companyId: string) {
  return getEmailReadQueue().add("read-emails", { companyId }, {
    ...DEFAULT_RETRY,
    removeOnComplete: { age: 86400 },
    removeOnFail: { age: 604800 },
  });
}

export async function addGespSyncJob(
  companyId: string,
  prioridade: "normal" | "urgente" = "normal"
) {
  return getGespSyncQueue().add("sync-empresa", { companyId, motivo: prioridade }, {
    ...GESP_RETRY,
    priority: prioridade === "urgente" ? 1 : 10,
    removeOnComplete: false,
    removeOnFail: false,
  });
}

export async function addComplianceJob(companyId: string) {
  return getComplianceQueue().add("check-validades", { companyId }, {
    ...DEFAULT_RETRY,
    removeOnComplete: { age: 86400 },
    removeOnFail: { age: 604800 },
  });
}

export async function addFleetJob(companyId: string) {
  return getFleetQueue().add("process-fleet", { companyId }, {
    ...DEFAULT_RETRY,
    removeOnComplete: { age: 86400 },
    removeOnFail: { age: 604800 },
  });
}

export async function addEmailSendJob(data: {
  companyId: string;
  templateId: EmailTemplateId;
  mode: EmailMode;
  to: string;
  subject: string;
  payload: Record<string, unknown>;
}) {
  return getEmailSendQueue().add("send-email", data, {
    attempts: 5,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: { age: 86400 },
    removeOnFail: { age: 604800 },
  });
}

export async function addBillingJob() {
  return getBillingQueue().add("billing-check", { date: new Date().toISOString() }, {
    ...DEFAULT_RETRY,
    removeOnComplete: { age: 86400 },
    removeOnFail: { age: 604800 },
  });
}

export async function addScheduledReportJob(companyId: string) {
  return getEmailSendQueue().add("scheduled-report", { companyId, tipo: "mensal" }, {
    ...DEFAULT_RETRY,
    removeOnComplete: { age: 86400 * 30 },
    removeOnFail: { age: 604800 },
  });
}

// --- Wrapper functions for orquestrador compatibility ---

export async function addCaptadorDOUJob(_data: {
  dispatchId: string;
  orquestradorId: string;
}) {
  return addDouJob();
}

export async function addCaptadorEmailJob(data: {
  dispatchId: string;
  orquestradorId: string;
  companyId: string;
}) {
  return addEmailReadJob(data.companyId);
}

export async function addOperacionalGESPJob(data: {
  dispatchId: string;
  orquestradorId: string;
  companyId: string;
  priority?: string;
}) {
  const prioridade = data.priority === "urgent" ? "urgente" : (data.priority || "normal") as "normal" | "urgente";
  return addGespSyncJob(data.companyId, prioridade);
}

export async function addOperacionalComplianceJob(data: {
  dispatchId: string;
  orquestradorId: string;
  companyId: string;
}) {
  return addComplianceJob(data.companyId);
}

export async function addOperacionalWorkflowJob(data: {
  dispatchId: string;
  orquestradorId: string;
  companyId: string;
}) {
  return addFleetJob(data.companyId);
}

export async function addComunicadorAlertsJob(data: {
  dispatchId: string;
  orquestradorId: string;
  companyId: string;
  alertType?: string;
  payload?: Record<string, unknown>;
}) {
  return getComunicadorAlertsQueue().add(
    "comunicador-alerts",
    {
      companyId: data.companyId,
      alertType: data.alertType || "general",
      payload: data.payload || {},
      dispatchId: data.dispatchId,
      orquestradorId: data.orquestradorId,
    },
    {
      ...DEFAULT_RETRY,
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 604800 },
    }
  );
}

export async function addComunicadorBatchJob(data: {
  dispatchId: string;
  orquestradorId: string;
  companyId: string;
}) {
  return { id: `dummy-batch-${data.dispatchId}` };
}

export async function addBillingCheckJob(_data: {
  dispatchId: string;
  orquestradorId: string;
}) {
  return addBillingJob();
}

// ─── Prospector Jobs ───────────────────────────────────────────────────────────

/**
 * Enfileira prospecção de uma data específica (trigger manual ou cron).
 */
export async function addProspectorDailyJob(date: string, force = false) {
  return getProspectorQueue().add(
    `prospector-daily-${date}`,
    { mode: "daily", date, force },
    {
      ...DEFAULT_RETRY,
      jobId: force ? undefined : `prospector-${date}`, // dedup por data (sem force)
      removeOnComplete: { age: 86400 * 7 },
      removeOnFail: { age: 86400 * 14 },
    }
  );
}

/**
 * Enfileira backfill de um range de datas (varredura histórica mensal).
 * @param dateFrom YYYY-MM-DD
 * @param dateTo   YYYY-MM-DD
 * @param force    Reprocessa mesmo datas já concluídas
 */
export async function addProspectorBackfillJob(
  dateFrom: string,
  dateTo: string,
  force = false
) {
  return getProspectorQueue().add(
    `prospector-backfill-${dateFrom}-${dateTo}`,
    { mode: "backfill", dateFrom, dateTo, force },
    {
      attempts: 2,
      backoff: { type: "exponential" as const, delay: 60_000 },
      removeOnComplete: { age: 86400 * 30 },
      removeOnFail: { age: 86400 * 30 },
    }
  );
}

// FIX: IA-02 — Dead Letter Queue Handler
/**
 * Registers a job failure to the DLQ and emits alert to system
 * Called when a job exhausts all retries
 */
export async function registerJobFailure(jobData: {
  queueName: string;
  jobId: string;
  jobName: string;
  data: Record<string, unknown>;
  failureReason: string;
  attemptCount: number;
}) {
  try {
    const supabase = createSupabaseAdmin();
    const dlq = getDLQueue();

    // 1. Add to DLQ for audit trail
    await dlq.add(
      "failed-job",
      {
        original_queue: jobData.queueName,
        original_job_id: jobData.jobId,
        job_name: jobData.jobName,
        job_data: jobData.data,
        failure_reason: jobData.failureReason,
        attempt_count: jobData.attemptCount,
        failed_at: new Date().toISOString(),
      },
      {
        removeOnComplete: { age: 30 * 86400 }, // Keep for 30 days
      }
    );

    // 2. Log to database for monitoring
    await supabase.from("system_events").insert({
      tipo: "job_failed_dlq",
      severidade: "error",
      mensagem: `Job ${jobData.queueName}:${jobData.jobName} failed after ${jobData.attemptCount} attempts`,
      detalhes: {
        queue: jobData.queueName,
        job_id: jobData.jobId,
        reason: jobData.failureReason,
        data: jobData.data,
      },
    });

    // 3. Emit alert to observability system
    console.error(`[DLQ] Job failed: ${jobData.queueName}/${jobData.jobName} (${jobData.jobId}): ${jobData.failureReason}`);
  } catch (err) {
    console.error(`[DLQ] Error registering job failure:`, err);
  }
}
