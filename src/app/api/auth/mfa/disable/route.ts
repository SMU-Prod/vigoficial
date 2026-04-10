import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { verifyToken } from "@/lib/auth/jwt";
import { verifyMfaToken } from "@/lib/auth/mfa";
import { cookies } from "next/headers";

/**
 * POST /api/auth/mfa/disable
 * Disable MFA after verifying current TOTP token
 * Auth required
 * Body: { token: string }
 */
export async function POST(request: NextRequest) {
  try {
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
    const { token: totpToken } = body as { token: string };

    if (!totpToken) {
      return NextResponse.json(
        { error: "Token obrigatório" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdmin();

    // Fetch user's MFA secret
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("mfa_secret, mfa_ativo")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Usuário não encontrado" },
        { status: 404 }
      );
    }

    if (!user.mfa_ativo || !user.mfa_secret) {
      return NextResponse.json(
        { error: "MFA não está ativado" },
        { status: 400 }
      );
    }

    // Verify TOTP
    const isValid = verifyMfaToken(user.mfa_secret, totpToken);

    if (!isValid) {
      return NextResponse.json(
        { error: "Código inválido" },
        { status: 401 }
      );
    }

    // Disable MFA and clear secret
    await supabase
      .from("users")
      .update({ mfa_ativo: false, mfa_secret: null })
      .eq("id", userId);

    return NextResponse.json({
      ok: true,
      message: "MFA desativado com sucesso",
    });
  } catch (err) {
    console.error("[MFA_DISABLE]", err);
    return NextResponse.json(
      { error: "Erro ao desativar MFA" },
      { status: 500 }
    );
  }
}
