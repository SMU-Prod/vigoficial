import { NextRequest, NextResponse } from "next/server";
import { runPatternDistillation } from "@/lib/iml/pattern-distiller";
import { env } from "@/lib/config/env";

/**
 * POST /api/cron/iml-distill
 *
 * GAP-04 FIX: Pattern Distiller cron — runs daily at 03:00 AM.
 * Analyzes Event Graph patterns and updates the Adaptive Playbook.
 *
 * Vercel cron.json entry:
 *   { "path": "/api/cron/iml-distill", "schedule": "0 3 * * *" }
 *
 * Authentication: CRON_SECRET header (x-cron-secret)
 */
export async function POST(request: NextRequest) {
  // Auth check — only internal cron or admin
  const cronSecret = request.headers.get("x-cron-secret");
  if (!cronSecret || cronSecret !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    const result = await runPatternDistillation();

    return NextResponse.json({
      ok: true,
      duration_ms: Date.now() - startedAt,
      patterns_found: result.patternsFound ?? 0,
      insights_created: result.insightsCreated ?? 0,
      insights_updated: result.insightsUpdated ?? 0,
      tokens_used: result.tokensUsed ?? 0,
      ran_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[IML-DISTILL CRON]", err);
    return NextResponse.json(
      {
        error: "Pattern distillation failed",
        message: err instanceof Error ? err.message : String(err),
        duration_ms: Date.now() - startedAt,
      },
      { status: 500 }
    );
  }
}

// Also support GET for easy health check / manual trigger
export async function GET(request: NextRequest) {
  return POST(request);
}
