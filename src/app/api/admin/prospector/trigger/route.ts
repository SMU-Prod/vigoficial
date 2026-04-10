import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { addProspectorDailyJob, addProspectorBackfillJob } from "@/lib/queue/jobs";

/**
 * POST /api/admin/prospector/trigger
 *
 * Dispara prospecção manualmente pela dashboard do admin.
 *
 * Body (modo diário):
 *   { "mode": "daily", "date": "2025-03-15", "force": false }
 *
 * Body (modo backfill — varredura histórica):
 *   { "mode": "backfill", "dateFrom": "2025-03-01", "dateTo": "2025-03-31", "force": false }
 *
 * Retorna jobId para acompanhamento.
 */
export async function POST(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "admin");
  if (denied) return denied;

  try {
    const body = await request.json();
    const { mode, date, dateFrom, dateTo, force = false } = body;

    if (!["daily", "backfill"].includes(mode)) {
      return NextResponse.json(
        { error: 'mode deve ser "daily" ou "backfill"' },
        { status: 400 }
      );
    }

    if (mode === "daily") {
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json({ error: "date inválido (esperado YYYY-MM-DD)" }, { status: 400 });
      }
      const job = await addProspectorDailyJob(date, force);
      return NextResponse.json({ ok: true, mode, jobId: job.id, date, force });
    }

    // backfill
    if (!dateFrom || !dateTo
      || !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)
      || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)
    ) {
      return NextResponse.json(
        { error: "dateFrom e dateTo inválidos (esperado YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    if (dateFrom > dateTo) {
      return NextResponse.json({ error: "dateFrom deve ser <= dateTo" }, { status: 400 });
    }

    // Limita backfill a 3 meses para evitar jobs excessivamente longos
    const diffDays = (new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86_400_000;
    if (diffDays > 92) {
      return NextResponse.json(
        { error: "Range máximo para backfill é 3 meses (92 dias)" },
        { status: 400 }
      );
    }

    const job = await addProspectorBackfillJob(dateFrom, dateTo, force);
    return NextResponse.json({ ok: true, mode, jobId: job.id, dateFrom, dateTo, force });
  } catch (err) {
    console.error("[ADMIN/PROSPECTOR/TRIGGER]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao enfileirar job" },
      { status: 500 }
    );
  }
}
