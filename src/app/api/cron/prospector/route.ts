import { NextRequest, NextResponse } from "next/server";
import { addProspectorDailyJob } from "@/lib/queue/jobs";
import { env } from "@/lib/config/env";

/**
 * POST /api/cron/prospector
 *
 * Cron de prospecção DOU — dispara às 07h (após DOU de 06h concluir).
 * Enfileira o job de prospecção do dia no BullMQ (concurrency 1).
 *
 * Normalmente o prospector já roda inline no douWorker (06h),
 * este endpoint serve como:
 *   1. Redundância — garante execução mesmo se o douWorker não completou
 *   2. Reprocessamento manual — GET com ?force=true
 *
 * Vercel cron: { "path": "/api/cron/prospector", "schedule": "0 7 * * 1-5" }
 */
export async function POST(request: NextRequest) {
  const cronSecret = request.headers.get("x-cron-secret");
  if (!cronSecret || cronSecret !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().split("T")[0];
  const force = new URL(request.url).searchParams.get("force") === "true";

  try {
    const job = await addProspectorDailyJob(today, force);
    return NextResponse.json({
      ok: true,
      jobId: job.id,
      date: today,
      force,
      queued_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[CRON/PROSPECTOR]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao enfileirar job" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
