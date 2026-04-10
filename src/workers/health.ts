/**
 * Worker Health Check — HTTP endpoint + heartbeat monitoring
 *
 * Expõe GET /health e GET /metrics para liveness/readiness probes.
 * Monitora heartbeat de cada worker e reporta via system_events.
 *
 * Uso com PM2: pm2 start src/workers/index.ts --name vigi-workers
 * Health check: curl http://localhost:9090/health
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import type { Worker } from "bullmq";

const HEALTH_PORT = parseInt(process.env.WORKER_HEALTH_PORT || "9090");
const HEARTBEAT_INTERVAL = 30_000; // 30s
const HEARTBEAT_STALE_THRESHOLD = 90_000; // 90s sem heartbeat = stale

interface WorkerHealth {
  name: string;
  lastHeartbeat: number;
  jobsCompleted: number;
  jobsFailed: number;
  isRunning: boolean;
  lastError?: string;
  lastErrorAt?: number;
}

const workerHealthMap = new Map<string, WorkerHealth>();
let startedAt = Date.now();

/**
 * Registra workers para monitoramento de heartbeat.
 * Deve ser chamado após criar os workers no index.ts.
 */
export function registerWorkers(workers: Worker[]) {
  startedAt = Date.now();

  for (const worker of workers) {
    const health: WorkerHealth = {
      name: worker.name,
      lastHeartbeat: Date.now(),
      jobsCompleted: 0,
      jobsFailed: 0,
      isRunning: true,
    };
    workerHealthMap.set(worker.name, health);

    // Heartbeat via eventos do BullMQ
    worker.on("completed", () => {
      health.lastHeartbeat = Date.now();
      health.jobsCompleted++;
    });

    worker.on("failed", (job, err) => {
      health.lastHeartbeat = Date.now();
      health.jobsFailed++;
      health.lastError = err.message;
      health.lastErrorAt = Date.now();
    });

    worker.on("active", () => {
      health.lastHeartbeat = Date.now();
    });

    worker.on("error", (err) => {
      health.lastError = err.message;
      health.lastErrorAt = Date.now();
    });

    worker.on("closed", () => {
      health.isRunning = false;
    });
  }

  // Heartbeat periódico: marca workers vivos mesmo sem jobs
  setInterval(() => {
    for (const worker of workers) {
      const h = workerHealthMap.get(worker.name);
      if (h && h.isRunning) {
        // Se worker está rodando, atualiza heartbeat
        h.lastHeartbeat = Date.now();
      }
    }
  }, HEARTBEAT_INTERVAL);
}

/**
 * Retorna status geral de saúde dos workers
 */
function getHealthStatus(): { healthy: boolean; workers: Record<string, unknown>; uptime: number } {
  const now = Date.now();
  const statuses: Record<string, unknown> = {};
  let allHealthy = true;

  for (const [name, health] of workerHealthMap.entries()) {
    const stale = now - health.lastHeartbeat > HEARTBEAT_STALE_THRESHOLD;
    const healthy = health.isRunning && !stale;
    if (!healthy) allHealthy = false;

    statuses[name] = {
      healthy,
      isRunning: health.isRunning,
      stale,
      lastHeartbeatAgo: `${Math.round((now - health.lastHeartbeat) / 1000)}s`,
      jobsCompleted: health.jobsCompleted,
      jobsFailed: health.jobsFailed,
      ...(health.lastError && {
        lastError: health.lastError,
        lastErrorAgo: health.lastErrorAt ? `${Math.round((now - health.lastErrorAt) / 1000)}s` : undefined,
      }),
    };
  }

  return {
    healthy: allHealthy,
    uptime: Math.round((now - startedAt) / 1000),
    workers: statuses,
  };
}

/**
 * Inicia servidor HTTP de health check.
 * GET /health — liveness probe (200 OK ou 503 Unhealthy)
 * GET /metrics — métricas dos workers (Prometheus-friendly)
 */
export function startHealthServer() {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method === "GET" && req.url === "/health") {
      const status = getHealthStatus();
      const code = status.healthy ? 200 : 503;
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(status));
      return;
    }

    if (req.method === "GET" && req.url === "/metrics") {
      // Prometheus-style plain text metrics
      const lines: string[] = [];
      lines.push(`# HELP vigi_worker_uptime_seconds Worker uptime in seconds`);
      lines.push(`# TYPE vigi_worker_uptime_seconds gauge`);
      lines.push(`vigi_worker_uptime_seconds ${Math.round((Date.now() - startedAt) / 1000)}`);

      for (const [name, health] of workerHealthMap.entries()) {
        const labels = `worker="${name}"`;
        lines.push(`vigi_worker_jobs_completed{${labels}} ${health.jobsCompleted}`);
        lines.push(`vigi_worker_jobs_failed{${labels}} ${health.jobsFailed}`);
        lines.push(`vigi_worker_healthy{${labels}} ${health.isRunning ? 1 : 0}`);
        lines.push(`vigi_worker_last_heartbeat_seconds_ago{${labels}} ${Math.round((Date.now() - health.lastHeartbeat) / 1000)}`);
      }

      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(lines.join("\n") + "\n");
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  });

  server.listen(HEALTH_PORT, () => {
    console.log(`[HEALTH] Health check server listening on :${HEALTH_PORT}`);
  });

  return server;
}
