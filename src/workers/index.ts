/**
 * VIGI Workers — Entry Point
 * Executar como processo separado: npx tsx src/workers/index.ts
 * Em produção: pm2 start src/workers/index.ts --name vigi-workers
 *
 * Cada worker processa sua fila com concurrency definida no PRD Seção 6.7
 */

import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { redisConnection } from "../lib/redis/connection";
import { registerWorkers, startHealthServer } from "./health";
import { readNewEmails, saveInboundEmails } from "../lib/email/gmail";
import { parseEmail } from "../lib/parser";
import { sendEmail } from "../lib/email/sender";
import { createSupabaseAdmin } from "../lib/supabase/server";
import { addGespSyncJob, addEmailSendJob } from "../lib/queue/jobs";
import { parseDOU } from "../lib/dou/parser";
import { DouScraperService } from "../lib/services/dou-scraper-service"; // GAP-01
import { runProspectorDaily, runProspectorBackfill } from "../lib/agents/prospector";
import { processProspectReply } from "../lib/agents/prospect-reply";
import { syncEmpresa } from "../lib/gesp/sync";
import { checkComplianceEmpresa } from "../lib/compliance/engine";
import { checkManutencao } from "../lib/fleet/gps";
import { billingDiario } from "../lib/billing/asaas";
import { WORKER_LIMITS } from "../lib/config/constants";
import { EMAIL_EQUIPE } from "../lib/config/constants";
import {
  notifyGespCompleted,
  notifyGespError,
} from "../lib/services/notification-service";

// Configuration flag for Gmail polling fallback
const USE_GMAIL_POLLING = process.env.USE_GMAIL_POLLING === "true";

const supabase = createSupabaseAdmin();
const redis = new Redis({
  host: (redisConnection as Record<string, unknown>).host as string || "127.0.0.1",
  port: (redisConnection as Record<string, unknown>).port as number || 6379,
  password: (redisConnection as Record<string, unknown>).password as string | undefined,
  maxRetriesPerRequest: null,
});

// ─────────────────────────────────────────────────────────────────────
// DOU Worker (concurrency: 1)
// ─────────────────────────────────────────────────────────────────────
// GAP-01 FIX: Unified DOU processing — DouScraperService (comprehensive,
// all 3 DOU sections, regex-based) runs first, then parseDOU() for AI
// enrichment. Previously these were two independent unconnected paths.
// ─────────────────────────────────────────────────────────────────────
const douWorker = new Worker(
  "dou",
  async (_job) => {
    const today = new Date().toISOString().split("T")[0];

    // STEP 1: Scrape estrutural das 3 seções do DOU (regex, sem IA)
    const scrapeResult = await DouScraperService.scrapeDate(today);

    // STEP 2: Enriquecimento IA para publicações sem alvará estruturado
    const aiResult = await parseDOU();

    // STEP 3: Prospecção — identifica clientes potenciais nos dados do DOU
    // Usa os alvarás já persistidos pelo scraper (Camada 1 = zero custo IA)
    // + publicações fuzzy via Haiku (Camada 2)
    // Cria/atualiza prospects e enfileira outreach automático
    const prospectResult = await runProspectorDaily(today);

    return {
      scrape: scrapeResult,
      ai_enrichment: aiResult,
      prospection: {
        newProspects: prospectResult.newProspectsCreated,
        updatedProspects: prospectResult.existingProspectsUpdated,
        outreachQueued: prospectResult.outreachEmailsQueued,
        errors: prospectResult.errors.length,
      },
      date: today,
    };
  },
  { connection: redisConnection, concurrency: 1 }
);

// ─────────────────────────────────────────────────────────────────────
// Prospector Worker (concurrency: 1)
// Processa jobs de prospecção avulsos: backfill mensal e triggers manuais.
// O ciclo diário é executado inline no douWorker acima.
// ─────────────────────────────────────────────────────────────────────
const prospectorWorker = new Worker(
  "prospector",
  async (job) => {
    const { mode, date, dateFrom, dateTo, force } = job.data;

    if (mode === "backfill" && dateFrom && dateTo) {
      return await runProspectorBackfill(dateFrom, dateTo, force ?? false);
    }

    if ((mode === "daily" || mode === "manual") && date) {
      return await runProspectorDaily(date, force ?? false);
    }

    throw new Error(`Prospector job inválido: mode=${mode}`);
  },
  { connection: redisConnection, concurrency: 1 }
);

// ─────────────────────────────────────────────────────────────────────
// Email Read Worker (concurrency: 5)
// Consome emails_inbound com status='recebido' via Resend Inbound webhook
// ou fallback para Gmail polling se USE_GMAIL_POLLING=true
// Classifica (Haiku) → extrai (Sonnet) → cria workflow → dispara urgente se necessário
// ─────────────────────────────────────────────────────────────────────
const emailReadWorker = new Worker(
  "email-read",
  async (job) => {
    // ── Rota especial: resposta de prospect ao email de prospecção ──
    if (job.name === "inbound.prospect_reply") {
      const { inboundId, fromEmail, subject, bodyText } = job.data;
      return await processProspectReply(inboundId, fromEmail, subject, bodyText);
    }

    const { companyId } = job.data;
    let inbounds = [];

    if (USE_GMAIL_POLLING) {
      // Fallback: Lê emails novos do Gmail
      const emails = await readNewEmails();
      if (emails.length === 0) return { processed: 0 };

      // Salva IMEDIATAMENTE no banco (Regra R2)
      inbounds = await saveInboundEmails(emails, companyId);
    } else {
      // Primary: Query email_inbound com status='recebido' para companyId
      const { data: results, error } = await supabase
        .from("email_inbound")
        .select("*")
        .eq("status", "recebido")
        .eq("company_id", companyId)
        .order("received_at", { ascending: true });

      if (error) {
        console.error(`[EMAIL-READ] Erro ao consultar email_inbound:`, error);
        return { processed: 0 };
      }

      inbounds = results || [];
    }

    if (inbounds.length === 0) {
      return { processed: 0 };
    }

    // Processa cada email
    for (const inbound of inbounds) {
      try {
        // Parser IA: classificação + extração
        const result = await parseEmail(
          inbound.subject,
          inbound.body_text,
          inbound.from_email
        );

        // Atualiza email_inbound com resultado do parser
        await supabase
          .from("email_inbound")
          .update({
            status: "processado",
            parser_resultado: result.dados_extraidos,
            tipo_demanda: result.tipo_demanda,
            confidence_score: result.confidence,
          })
          .eq("id", inbound.id);

        // Cria workflow
        const { data: workflow } = await supabase
          .from("email_workflows")
          .insert({
            company_id: companyId,
            email_inbound_id: inbound.id,
            tipo_demanda: result.tipo_demanda,
            prioridade: result.urgente ? "urgente" : "normal",
            status: result.tipo_demanda === "caso_desconhecido"
              ? "caso_desconhecido"
              : "classificado",
            dados_extraidos: result.dados_extraidos,
          })
          .select()
          .single();

        if (workflow) {
          await supabase
            .from("email_inbound")
            .update({ workflow_id: workflow.id })
            .eq("id", inbound.id);

          // Caso desconhecido → Template E para equipe (Regra R7)
          if (result.tipo_demanda === "caso_desconhecido") {
            const { data: company } = await supabase
              .from("companies")
              .select("razao_social")
              .eq("id", companyId)
              .single();

            await addEmailSendJob({
              companyId,
              templateId: "E",
              mode: "CLIENTE_HTML",
              to: EMAIL_EQUIPE,
              subject: `[CASO DESCONHECIDO] ${company?.razao_social || ""} — ${inbound.subject}`,
              payload: {
                razaoSocial: company?.razao_social || "",
                fromEmail: inbound.from_email,
                subject: inbound.subject,
                bodyPreview: inbound.body_text.slice(0, 2000),
                dadosExtraidos: JSON.stringify(result.dados_extraidos, null, 2),
                workflowId: workflow.id,
              },
            });
          }

          // Urgente → dispara ciclo GESP imediato (Regra R10)
          if (result.urgente) {
            await addGespSyncJob(companyId, "urgente");
          }
        }
      } catch (err) {
        console.error(`[EMAIL-READ] Erro ao processar email ${inbound.id}:`, err);
        await supabase
          .from("email_inbound")
          .update({ status: "erro" })
          .eq("id", inbound.id);
      }
    }

    return { processed: inbounds.length };
  },
  { connection: redisConnection, concurrency: 5 }
);

// ─────────────────────────────────────────────────────────────────────
// GESP Sync Worker (concurrency: 3 — Regra R5)
// ─────────────────────────────────────────────────────────────────────
const gespSyncWorker = new Worker(
  "gesp-sync",
  async (job) => {
    try {
      const result = await syncEmpresa(job.data.companyId);
      notifyGespCompleted(
        job.data.companyName || "Empresa",
        "Sincronização GESP",
        job.data.companyId
      ).catch(() => {});
      return result;
    } catch (err) {
      notifyGespError(
        job.data.companyName || "Empresa",
        err instanceof Error ? err.message : "Erro desconhecido",
        job.data.companyId
      ).catch(() => {});
      throw err;
    }
  },
  { connection: redisConnection, concurrency: 3 }
);

// ─────────────────────────────────────────────────────────────────────
// GESP Action Worker (concurrency: 3)
// ─────────────────────────────────────────────────────────────────────
const gespActionWorker = new Worker(
  "gesp-action",
  async (job) => {
    try {
      const result = await syncEmpresa(job.data.companyId);
      notifyGespCompleted(
        job.data.companyName || "Empresa",
        "Ação GESP",
        job.data.companyId
      ).catch(() => {});
      return result;
    } catch (err) {
      notifyGespError(
        job.data.companyName || "Empresa",
        err instanceof Error ? err.message : "Erro desconhecido",
        job.data.companyId
      ).catch(() => {});
      throw err;
    }
  },
  { connection: redisConnection, concurrency: 3 }
);

// ─────────────────────────────────────────────────────────────────────
// Compliance Worker (concurrency: 10)
// Motor de validades — verifica CNV, alvará, reciclagem, coletes, etc.
// PRD Seção 3.7 — Regra R3 (billing gating), R9 (alert lifecycle)
// ─────────────────────────────────────────────────────────────────────
const complianceWorker = new Worker(
  "compliance",
  async (job) => {
    const { companyId } = job.data;
    const result = await checkComplianceEmpresa(companyId);
    return result;
  },
  { connection: redisConnection, concurrency: 10 }
);

// ─────────────────────────────────────────────────────────────────────
// Fleet Worker (concurrency: 5)
// ─────────────────────────────────────────────────────────────────────
const fleetWorker = new Worker(
  "fleet",
  async (job) => {
    const result = await checkManutencao(job.data.companyId);
    return result;
  },
  { connection: redisConnection, concurrency: 5 }
);

// ─────────────────────────────────────────────────────────────────────
// Email Send Worker (concurrency: 5, rate limited: 5 req/s)
// Envia emails via Resend — respeitando limite de 5 req/s
// PRD Regra R11: HTML para clientes, plain text para PF
// ─────────────────────────────────────────────────────────────────────
const emailSendWorker = new Worker(
  "email-send",
  async (job) => {
    const { companyId, templateId, mode, to, subject, payload } = job.data;

    await sendEmail({
      companyId,
      templateId,
      mode,
      to,
      subject,
      payload,
    });
  },
  {
    connection: redisConnection,
    concurrency: 5,
    limiter: WORKER_LIMITS.emailSend, // { max: 5, duration: 1000 } — Resend 5 req/s
  }
);

// ─────────────────────────────────────────────────────────────────────
// Billing Worker (concurrency: 1)
// ─────────────────────────────────────────────────────────────────────
const billingWorker = new Worker(
  "billing",
  async (_job) => {
    const result = await billingDiario();
    return result;
  },
  { connection: redisConnection, concurrency: 1 }
);

// ─────────────────────────────────────────────────────────────────────
// Graceful shutdown com timeout
// ─────────────────────────────────────────────────────────────────────
const workers = [
  douWorker,
  prospectorWorker,
  emailReadWorker,
  gespSyncWorker,
  gespActionWorker,
  complianceWorker,
  fleetWorker,
  emailSendWorker,
  billingWorker,
];

let isShuttingDown = false;

async function shutdown(_signal: string) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  try {
    await Promise.all(workers.map((w) => w.pause()));

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Timeout aguardando jobs")),
        30_000
      )
    );

    const closePromise = Promise.all(workers.map((w) => w.close()));
    await Promise.race([closePromise, timeoutPromise]);

    await redis.quit();

    process.exit(0);
  } catch (err) {
    console.error("[WORKERS] Erro durante encerramento:", err);
    setTimeout(() => {
      console.error("[WORKERS] Timeout excedido, encerrando forcefully");
      process.exit(1);
    }, 5000);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Register workers for health monitoring
registerWorkers(workers);

// Start HTTP health check server (:9090/health, :9090/metrics)
startHealthServer();

for (const worker of workers) {
  worker.on("completed", (_job) => {
  });
  worker.on("failed", (job, err) => {
    console.error(`[${worker.name}] Job ${job?.id} falhou:`, err.message);
  });
}

console.log(`[WORKERS] ${workers.length} workers iniciados com health monitoring`);

