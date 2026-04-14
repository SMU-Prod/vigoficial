import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { verifyToken } from "@/lib/auth/jwt";
import { verifyMfaToken } from "@/lib/auth/mfa";
import { rateLimit, createRateLimitResponse } from "@/lib/security/rate-limit";
import { env } from "@/lib/config/env"; // OPS-02: Use validated env
import Redis from "ioredis";
import { cookies } from "next/headers";

/**
 * POST /api/auth/mfa/verify
 * Verify TOTP token and enable MFA
 * Auth required
 * Body: { token: string }
 */
export async function POST(request: NextRequest) {
  try {
    // FIX: SEG-06 - Add rate limiting on MFA verification (5 attempts per 15 min)
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

    // Parse body
    const body = await request.json();
    const { token: totpToken, tempSecretId } = body as { token: string; tempSecretId?: string };

    if (!totpToken) {
      return NextResponse.json(
        { error: "Token obrigatório" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdmin();

    // FIX: SEG-10 - Retrieve TOTP secret from Redis (temporary storage) or fall back to DB
    let mfaSecret: string | null = null;

    if (tempSecretId) {
      try {
        const redis = new Redis({
          host: env.REDIS_HOST,
          port: env.REDIS_PORT,
          password: env.REDIS_PASSWORD || undefined,
        });

        mfaSecret = await redis.getdel(tempSecretId);
        await redis.quit();
      } catch (error) {
        console.warn("[MFA_VERIFY] Redis retrieval failed, falling back to DB:", error);
      }
    }

    // Fallback: fetch from DB if not in Redis
    if (!mfaSecret) {
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("mfa_secret")
        .eq("id", userId)
        .single();

      if (userError || !user || !user.mfa_secret) {
        return NextResponse.json(
          { error: "MFA não configurado" },
          { status: 400 }
        );
      }

      mfaSecret = user.mfa_secret;
    }

    // Verify TOTP
    const isValid = verifyMfaToken(mfaSecret!, totpToken);

    if (!isValid) {
      return NextResponse.json(
        { error: "Código inválido" },
        { status: 401 }
      );
    }

    // Enable MFA and persist the secret only after successful verification
    await supabase
      .from("users")
      .update({ mfa_ativo: true, mfa_secret: mfaSecret })
      .eq("id", userId);

    return NextResponse.json({
      ok: true,
      message: "MFA ativado com sucesso",
    });
  } catch (err) {
    console.error("[MFA_VERIFY]", err);
    return NextResponse.json(
      { error: "Erro ao verificar MFA" },
      { status: 500 }
    );
  }
}
