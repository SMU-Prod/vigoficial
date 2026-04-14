import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getAuthFromRequest } from "@/lib/auth/middleware";
import { comparePassword, hashPassword } from "@/lib/auth/password";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { validateBody, changePasswordSchema } from "@/lib/validation/schemas";

/**
 * POST /api/auth/change-password — Trocar senha (qualquer usuário autenticado)
 */
export async function POST(request: NextRequest) {
  // Rate limiting (stricter for password changes)
  const limitResult = await rateLimit(request, rateLimitConfig.login);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // Validate body
  const { data, error: validationError } = await validateBody(request, changePasswordSchema);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { senhaAtual, novaSenha } = data as { senhaAtual: string; novaSenha: string };


  const supabase = createSupabaseAdmin();

  const { data: user } = await supabase
    .from("users")
    .select("password_hash")
    .eq("id", auth.userId)
    .single();

  if (!user) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }

  const senhaCorreta = await comparePassword(senhaAtual, user.password_hash);
  if (!senhaCorreta) {
    return NextResponse.json({ error: "Senha atual incorreta" }, { status: 401 });
  }

  const newHash = await hashPassword(novaSenha);

  await supabase
    .from("users")
    .update({ password_hash: newHash, deve_trocar_senha: false })
    .eq("id", auth.userId);

  await supabase.from("audit_log").insert({
    user_id: auth.userId,
    acao: "trocar_senha",
    detalhes: {},
    ip: request.headers.get("x-forwarded-for") || "unknown",
  });

  return NextResponse.json({ ok: true });
}
