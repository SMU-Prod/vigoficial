import { NextRequest, NextResponse } from "next/server";
import { signToken } from "@/lib/auth/jwt";
import { rotateRefreshToken, generateRefreshToken, saveRefreshToken } from "@/lib/auth/refresh-token";
import { createSupabaseAdmin } from "@/lib/supabase/server";

/**
 * POST /api/auth/refresh
 *
 * Rotaciona refresh token e emite novo access token.
 * O refresh token vem do cookie `vigi_refresh`.
 * Retorna novo access token via /auth/callback pattern.
 */
export async function POST(request: NextRequest) {
  const refreshCookie = request.cookies.get("vigi_refresh")?.value;

  if (!refreshCookie) {
    return NextResponse.json({ error: "Refresh token não encontrado" }, { status: 401 });
  }

  // Valida e rotaciona
  const result = await rotateRefreshToken(refreshCookie);

  if (!result) {
    // Token inválido ou reuse detected — limpa cookies
    const response = NextResponse.json(
      { error: "Refresh token inválido ou expirado" },
      { status: 401 }
    );
    response.cookies.set("vigi_token", "", { maxAge: 0, path: "/" });
    response.cookies.set("vigi_refresh", "", { maxAge: 0, path: "/" });
    return response;
  }

  // Busca user atualizado
  const supabase = createSupabaseAdmin();
  const { data: user, error } = await supabase
    .from("users")
    .select("id, email, role, company_ids")
    .eq("id", result.userId)
    .single();

  if (error || !user) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 401 });
  }

  // Gera novo access token
  const accessToken = signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    companyIds: user.company_ids || [],
  });

  // Gera novo refresh token (rotação)
  const newRefresh = generateRefreshToken();
  await saveRefreshToken(user.id, newRefresh.hash, result.familyId);

  // Retorna tokens
  const response = NextResponse.json({
    ok: true,
    token: accessToken,
  });

  // Set novo refresh cookie
  response.cookies.set("vigi_refresh", newRefresh.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60, // 7 dias
  });

  return response;
}
