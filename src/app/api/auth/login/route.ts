import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { comparePassword } from "@/lib/auth/password";
import { signToken, signMfaTempToken } from "@/lib/auth/jwt";
import { rateLimit, rateLimitConfig, createRateLimitResponse, resetRateLimit } from "@/lib/security/rate-limit";
import { validateBody, loginSchema } from "@/lib/validation/schemas";
import { validateCsrf } from "@/lib/security/csrf-middleware"; // FE-02
// Token é retornado no body — o cookie é setado pelo middleware em /auth/callback

/**
 * POST /api/auth/login
 * Autenticação com bcrypt + JWT em cookie httpOnly
 * PRD Seção 3.8 e Seção 7
 */
export async function POST(request: NextRequest) {
  try {
    // FE-02: CSRF validation for mutation endpoint
    const csrfCheck = validateCsrf(request);
    if (!csrfCheck.valid) {
      console.warn("[LOGIN] CSRF validation failed:", csrfCheck.error);
      return NextResponse.json(
        { error: "CSRF token validation failed" },
        { status: 403 }
      );
    }

    // Rate limiting (stricter for login)
    const limitResult = await rateLimit(request, rateLimitConfig.login);
    const limitResponse = createRateLimitResponse(limitResult);
    if (limitResponse) return limitResponse;

    // Validate body
    const { data, error: validationError } = await validateBody(request, loginSchema);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // FE-01: Use proper type from validation schema instead of 'as any'
    const { email, password } = data as z.infer<typeof loginSchema>;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email e senha são obrigatórios" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdmin();

    // Busca usuário
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("email", email.toLowerCase().trim())
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Credenciais inválidas" },
        { status: 401 }
      );
    }

    // Verifica bloqueio por tentativas (PRD: 10 tentativas → 1h bloqueio)
    if (user.bloqueado_ate && new Date(user.bloqueado_ate) > new Date()) {
      return NextResponse.json(
        { error: "Conta bloqueada. Tente novamente mais tarde." },
        { status: 423 }
      );
    }

    // Verifica senha
    const senhaCorreta = await comparePassword(password, user.password_hash);

    if (!senhaCorreta) {
      const tentativas = (user.tentativas_falhas || 0) + 1;
      const updateData: Record<string, unknown> = {
        tentativas_falhas: tentativas,
      };

      // Bloqueia após 10 tentativas
      if (tentativas >= 10) {
        const bloqueio = new Date();
        bloqueio.setHours(bloqueio.getHours() + 1);
        updateData.bloqueado_ate = bloqueio.toISOString();
      }

      await supabase
        .from("users")
        .update(updateData as Record<string, unknown>)
        .eq("id", user.id);

      return NextResponse.json(
        { error: "Credenciais inválidas" },
        { status: 401 }
      );
    }

    // Login ok — reseta tentativas e rate limit
    await supabase
      .from("users")
      .update({ tentativas_falhas: 0, bloqueado_ate: null })
      .eq("id", user.id);
    resetRateLimit(request, rateLimitConfig.login);

    // Audit log
    await supabase.from("audit_log").insert({
      user_id: user.id,
      acao: "login",
      detalhes: { email: user.email },
      ip: request.headers.get("x-forwarded-for") || "unknown",
    });

    // Check if MFA is enabled
    if (user.mfa_ativo) {
      // Generate temporary token for MFA verification (5 min)
      const tempToken = signMfaTempToken(user.id);
      return NextResponse.json({
        requireMfa: true,
        tempToken,
      });
    }

    // Gera JWT
    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      companyIds: user.company_ids || [],
    });

    // Retorna token no body — o cookie será setado pelo middleware
    // quando o client navegar para /auth/callback?token=XXX
    return NextResponse.json({
      ok: true,
      token,
      redirect: user.deve_trocar_senha ? "/admin/perfil?trocar=1" : "/dashboard",
    });
  } catch (err) {
    console.error("[LOGIN]", err);
    return NextResponse.json(
      { error: "Erro interno" },
      { status: 500 }
    );
  }
}
