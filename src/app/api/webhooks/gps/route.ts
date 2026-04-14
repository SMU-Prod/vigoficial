import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { processarTelemetria } from "@/lib/fleet/gps";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { verifyHmacSignature } from "@/lib/webhooks/signature";
import { env } from "@/lib/config/env"; // OPS-02

/**
 * POST /api/webhooks/gps — Recebe dados GPS de qualquer rastreador
 * PRD Seção 3.5 — Integração agnóstica
 *
 * FE-03: Uses HMAC-SHA256 signature verification instead of simple string comparison
 * Expected headers:
 *   - x-gps-signature: HMAC-SHA256 hex digest of raw body
 *   - Content-Type: application/json
 */
export async function POST(request: NextRequest) {
  try {
    // Get the raw body for signature verification
    const rawBody = await request.text();

    // Signature verification (optional if not configured for backward compatibility)
    const webhookSecret = env.GPS_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signatureHeader = request.headers.get("x-gps-signature");
      if (!signatureHeader) {
        console.error("[GPS-WEBHOOK] Missing x-gps-signature header");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const isValid = await verifyHmacSignature(rawBody, signatureHeader, webhookSecret, "sha256");
      if (!isValid) {
        console.error("[GPS-WEBHOOK] Signature verification failed");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    } else {
      // No signature configured — backward compatibility mode
      console.warn("[GPS-WEBHOOK] GPS_WEBHOOK_SECRET not configured. Running without signature verification.");
    }

    // Parse the validated body
    let body;
    try {
      body = JSON.parse(rawBody);
    } catch (_parseError) {
      console.error("[GPS-WEBHOOK] Invalid JSON body");
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // Rate limiting (webhooks can have higher limits)
    const limitResult = await rateLimit(request, rateLimitConfig.webhook);
    const limitResponse = createRateLimitResponse(limitResult);
    if (limitResponse) return limitResponse;

    const { device_id, provider, latitude, longitude, velocidade, ignicao, odometro } = body;

    if (!device_id || !latitude || !longitude) {
      return NextResponse.json({ error: "device_id, latitude e longitude obrigatórios" }, { status: 400 });
    }

    // Busca veículo pelo device_id do GPS
    const supabase = createSupabaseAdmin();
    const { data: vehicle } = await supabase
      .from("vehicles")
      .select("id")
      .eq("gps_device_id", device_id)
      .single();

    if (!vehicle) {
      return NextResponse.json({ error: "Veículo não encontrado" }, { status: 404 });
    }

    await processarTelemetria(vehicle.id, {
      latitude,
      longitude,
      velocidade,
      ignicao,
      odometro,
      provider: provider || "generico",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[GPS WEBHOOK]", err);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
