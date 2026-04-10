import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { verifyToken } from "@/lib/auth/jwt";
import { generateMfaSecret } from "@/lib/auth/mfa";
import { rateLimit, createRateLimitResponse } from "@/lib/security/rate-limit";
import { env } from "@/lib/config/env"; // OPS-02: Use validated env
import Redis from "ioredis";
import { cookies } from "next/headers";

/**
 * POST /api/auth/mfa/setup
 * Generate MFA secret and QR code for current user
 * Auth required
 */
export async function POST(request: NextRequest) {
  try {
    // FIX: SEG-06 - Add rate limiting on MFA setup (5 attempts per 15 min)
    const mfaRateLimitConfig = { windowMs: 15 * 60 * 1000, maxRequests: 5 };
    const limitResult = await rateLimit(request, mfaRateLimitConfig);
    const limitResponse = createRateLimitResponse(limitResult);
    if (limitResponse) return limitResponse;

    // Get token from cookie
    const cookieStore = await cookies();
    const token = cookieStore.get("vigi_token")?.value;

    if (!token) {
      return NextResponse.json(
        { error: "Não autenticado" },
        { status: 401 }
      );
    }

    // Verify token
    const payload = verifyToken(token);
    const userId = payload.userId;

    const supabase = createSupabaseAdmin();

    // Fetch current user to get email
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("email")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Usuário não encontrado" },
        { status: 404 }
      );
    }

    // Generate MFA secret
    const { secret, otpauthUrl, qrCodeDataUrl } = await generateMfaSecret(user.email);

    // FIX: SEG-10 - Store TOTP secret in Redis temporarily instead of directly in DB
    // Only persist after first successful verify
    let tempSecretId = "";
    try {
      const redis = new Redis({
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        password: env.REDIS_PASSWORD || undefined,
      });

      // Generate unique ID for this setup session
      tempSecretId = `mfa:setup:${userId}:${Date.now()}`;
      // Store secret in Redis with 15 minute expiration (user has time to verify)
      await redis.setex(tempSecretId, 15 * 60, secret);
      await redis.quit();
    } catch (error) {
      console.warn("[MFA_SETUP] Redis storage failed, falling back to DB temp storage:", error);
      // Fallback: store in DB (less secure but better than losing the secret)
      await supabase.from("users").update({ mfa_secret: secret }).eq("id", userId);
    }

    return NextResponse.json({
      qrCodeDataUrl,
      secret, // For manual entry
      otpauthUrl,
      tempSecretId, // Client should include this in verify request
    });
  } catch (err) {
    console.error("[MFA_SETUP]", err);
    return NextResponse.json(
      { error: "Erro ao configurar MFA" },
      { status: 500 }
    );
  }
}
