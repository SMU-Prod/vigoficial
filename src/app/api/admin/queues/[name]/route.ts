import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/jwt";
import { cookies } from "next/headers";
import { redisConnection } from "@/lib/redis/connection";
import net from "net";

async function isRedisReachable(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1500);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => { socket.destroy(); resolve(false); });
    const conn = redisConnection as { host?: string; port?: number };
    socket.connect(conn.port || 6379, conn.host || "127.0.0.1");
  });
}

/**
 * GET /api/admin/queues/[name]
 * Get jobs for a specific queue with pagination
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("vigi_token")?.value;
    if (!token) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const payload = verifyToken(token);
    if (payload.role !== "admin") return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

    const { name: queueName } = await params;

    // Check Redis first
    if (!(await isRedisReachable())) {
      return NextResponse.json({
        name: queueName,
        status: "offline",
        page: 0,
        limit: 20,
        total: 0,
        jobs: [],
        redisStatus: "offline",
        message: "Redis não está disponível",
      });
    }

    const { getAllQueues } = await import("@/lib/queue/queues");
    const queue = getAllQueues().find((q) => q.name === queueName);

    if (!queue) {
      return NextResponse.json({ error: "Fila não encontrada" }, { status: 404 });
    }

    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "active";
    const page = parseInt(url.searchParams.get("page") || "0");
    const limit = parseInt(url.searchParams.get("limit") || "20");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let jobs: any[] = [];
    let total = 0;

    try {
      switch (status) {
        case "active":
          total = await queue.getActiveCount();
          jobs = await queue.getJobs(["active"], 0, limit);
          break;
        case "waiting":
          total = await queue.getWaitingCount();
          jobs = await queue.getJobs(["waiting"], page * limit, (page + 1) * limit);
          break;
        case "completed":
          total = await queue.getCompletedCount();
          jobs = await queue.getJobs(["completed"], page * limit, (page + 1) * limit);
          break;
        case "failed":
          total = await queue.getFailedCount();
          jobs = await queue.getJobs(["failed"], page * limit, (page + 1) * limit);
          break;
        case "delayed":
          total = await queue.getDelayedCount();
          jobs = await queue.getJobs(["delayed"], page * limit, (page + 1) * limit);
          break;
        default:
          return NextResponse.json({ error: "Status inválido" }, { status: 400 });
      }
    } catch (err) {
      console.error(`Error getting jobs for queue ${queueName}:`, err);
    }

    const jobsData = jobs.map((job) => ({
      id: job.id,
      name: job.name,
      data: job.data,
      progress: job.progress(),
      attempts: job.attemptsMade,
      maxAttempts: job.opts.attempts,
      timestamp: job.timestamp,
      finishedOn: job.finishedOn,
      failedReason: job.failedReason,
    }));

    return NextResponse.json({
      name: queueName,
      status,
      page,
      limit,
      total,
      jobs: jobsData,
      redisStatus: "online",
    });
  } catch (err) {
    console.error("[QUEUE_DETAIL_GET]", err);
    return NextResponse.json({ error: "Erro ao buscar fila" }, { status: 500 });
  }
}

/**
 * POST /api/admin/queues/[name]
 * Perform actions on queue jobs
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("vigi_token")?.value;
    if (!token) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const payload = verifyToken(token);
    if (payload.role !== "admin") return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

    if (!(await isRedisReachable())) {
      return NextResponse.json({
        error: "Redis offline — não é possível manipular filas",
        redisStatus: "offline",
      }, { status: 503 });
    }

    const { name: queueName } = await params;
    const { getAllQueues } = await import("@/lib/queue/queues");
    const queue = getAllQueues().find((q) => q.name === queueName);

    if (!queue) {
      return NextResponse.json({ error: "Fila não encontrada" }, { status: 404 });
    }

    const body = await request.json();
    const { action, jobId } = body as { action: string; jobId?: string };

    if (action === "retry" && jobId) {
      const job = await queue.getJob(jobId);
      if (!job) return NextResponse.json({ error: "Job não encontrado" }, { status: 404 });
      await job.retry();
      return NextResponse.json({ ok: true, message: "Job retentado" });
    } else if (action === "clean") {
      const olderThan = Date.now() - 24 * 60 * 60 * 1000;
      await queue.clean(olderThan, 1000, "completed");
      return NextResponse.json({ ok: true, message: "Jobs completados limpados" });
    } else {
      return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
    }
  } catch (err) {
    console.error("[QUEUE_DETAIL_POST]", err);
    return NextResponse.json({ error: "Erro ao processar fila" }, { status: 500 });
  }
}
