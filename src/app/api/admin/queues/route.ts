import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/jwt";
import { cookies } from "next/headers";
import { redisConnection } from "@/lib/redis/connection";
import net from "net";

/**
 * Verifica se Redis está acessível antes de criar conexões BullMQ
 */
async function isRedisReachable(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const conn = redisConnection as { host?: string; port?: number };
    const host = conn.host || "127.0.0.1";
    const port = conn.port || 6379;

    socket.setTimeout(1500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

const QUEUE_NAMES = [
  "dou",
  "email-read",
  "gesp-sync",
  "gesp-action",
  "compliance",
  "fleet",
  "email-send",
  "billing",
];

/**
 * GET /api/admin/queues
 * Returns status of all 8 BullMQ queues
 * Admin only — returns graceful "offline" status when Redis is down
 */
export async function GET(_request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("vigi_token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (payload.role !== "admin") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    // Check Redis before creating BullMQ connections
    const redisOnline = await isRedisReachable();

    if (!redisOnline) {
      // Return offline status for all queues — no BullMQ connection attempted
      const offlineStats = QUEUE_NAMES.map((name) => ({
        name,
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        paused: false,
        error: "Redis offline",
      }));

      return NextResponse.json({
        queues: offlineStats,
        redisStatus: "offline",
        message: "Redis não está disponível. Inicie o Redis para gerenciar filas.",
      });
    }

    // Redis is up — safe to create BullMQ queues
    const { getAllQueues } = await import("@/lib/queue/queues");

    const queueStats = await Promise.all(
      getAllQueues().map(async (queue) => {
        try {
          const counts = await queue.getJobCounts();
          const isPaused = await queue.isPaused();

          return {
            name: queue.name,
            waiting: counts.waiting || 0,
            active: counts.active || 0,
            completed: counts.completed || 0,
            failed: counts.failed || 0,
            delayed: counts.delayed || 0,
            paused: isPaused,
          };
        } catch (err) {
          console.error(`Error getting stats for queue ${queue.name}:`, err);
          return {
            name: queue.name,
            waiting: 0,
            active: 0,
            completed: 0,
            failed: 0,
            delayed: 0,
            paused: false,
            error: "Erro ao buscar stats",
          };
        }
      })
    );

    return NextResponse.json({ queues: queueStats, redisStatus: "online" });
  } catch (err) {
    console.error("[QUEUES_GET]", err);
    return NextResponse.json(
      { error: "Erro ao buscar filas" },
      { status: 500 }
    );
  }
}
