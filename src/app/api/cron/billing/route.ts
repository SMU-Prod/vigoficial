import { NextRequest, NextResponse } from "next/server";
import { addBillingJob } from "@/lib/queue/jobs";
import { rateLimit, createRateLimitResponse } from "@/lib/security/rate-limit";

/**
 * POST /api/cron/billing — Dispara check diário de billing (08h)
 */
export async function POST(request: NextRequest) {
  // Rate limiting for cron endpoints (stricter than webhooks)
  const cronLimitConfig = { windowMs: 60 * 1000, maxRequests: 10 };
  const limitResult = await rateLimit(request, cronLimitConfig);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;
  try {
    await addBillingJob();
    return NextResponse.json({ ok: true, ciclo: new Date().toISOString() });
  } catch (err) {
    console.error("[CRON BILLING]", err);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
