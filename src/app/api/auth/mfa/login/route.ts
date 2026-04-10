import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { verifyMfaTempToken, signToken } from "@/lib/auth/jwt";
import { verifyMfaToken } from "@/lib/auth/mfa";
import { rateLimit, createRateLimitResponse } from "@/lib/security/rate-limit";
// Token é retornado no body — o cookie é setado pelo middleware em /auth/callback

/**
 * POST /api/auth/mfa/login
 * Complete login with MFA token
 * Body: { tempToken: string, mfaToken: string }
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limiting (5 requests per 5 minutes for MFA)
    const mfaConfig = { windowMs: 5 * 60 * 1000, maxRequests: 5 };
    const limitResult = await rateLimit(request, mfaConfig);
    const limitResponse = createRateLimitResponse(limitResult);
    if (limitResponse) return limitResponse;

    // Parse body
    const body = await request.json();
    const { tempToken, mfaToken } = body as { tempToken: string; mfaToken: string };

    if (!tempToken || !mfaToken) {
      return NextResponse.json(
        { error: "Token temporário e código MFA obrigatórios" },
        { status: 400 }
      );
    }

    // Verify temp token
    let userId: string;
    try {
      userId = verifyMfaTempToken(tempToken);
    } catch {
      return NextResponse.json(
        { error: "Token temporário inválido ou expirado" },
        { status: 401 }
      );
    }

    const supabase = createSupabaseAdmin();

    // Fetch user and MFA secret
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, email, mfa_secret, mfa_ativo, role, company_ids, deve_trocar_senha")
      .eq("id", userId)
      .single();

    if (userError || !user || !user.mfa_ativo || !user.mfa_secret) {
      return NextResponse.json(
        { error: "MFA não configurado" },
        { status: 400 }
      );
    }

    // Verify TOTP
    const isValid = verifyMfaToken(user.mfa_secret, mfaToken);

    if (!isValid) {
      return NextResponse.json(
        { error: "Código MFA inválido" },
        { status: 401 }
      );
    }

    // Create full session JWT
    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      companyIds: user.company_ids || [],
    });

    // Retorna token no body — cookie setado pelo middleware em /auth/callback
    return NextResponse.json({
      ok: true,
      token,
      redirect: user.deve_trocar_senha ? "/admin/perfil?trocar=1" : "/dashboard",
    });
  } catch (err) {
    console.error("[MFA_LOGIN]", err);
    return NextResponse.json(
      { error: "Erro ao fazer login com MFA" },
      { status: 500 }
    );
  }
}
