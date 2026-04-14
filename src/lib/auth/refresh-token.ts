/**
 * Refresh Token Rotation — VIGI PRO
 *
 * Implementa refresh token rotation seguro:
 * - Access token: 15 min (curto, no cookie httpOnly)
 * - Refresh token: 7 dias (longo, no banco + cookie httpOnly)
 * - Rotação: cada uso do refresh token gera novo par (access + refresh)
 * - Reuse detection: refresh token usado 2x invalida toda a família
 *
 * Fluxo:
 * 1. Login → gera access_token (15min) + refresh_token (7d) → salva no DB
 * 2. Access expira → client chama /api/auth/refresh com refresh cookie
 * 3. Server valida refresh → gera novo access + novo refresh → invalida antigo
 * 4. Se refresh antigo já foi usado → invalida TODA família (breach detected)
 */

import { randomBytes, createHash } from "crypto";
import { createSupabaseAdmin } from "@/lib/supabase/server";

const REFRESH_TOKEN_EXPIRY_DAYS = 7;

/**
 * Gera um refresh token opaco (não-JWT) com hash para storage seguro.
 */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(48).toString("base64url");
  const hash = hashToken(token);
  return { token, hash };
}

/**
 * Hash SHA-256 do token (armazena o hash no DB, não o token raw)
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Salva refresh token no banco (hash only)
 */
export async function saveRefreshToken(
  userId: string,
  tokenHash: string,
  familyId?: string
): Promise<string> {
  const supabase = createSupabaseAdmin();
  const family = familyId || randomBytes(16).toString("hex");

  await supabase.from("refresh_tokens").insert({
    user_id: userId,
    token_hash: tokenHash,
    family_id: family,
    expires_at: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    used: false,
  });

  return family;
}

/**
 * Valida e rotaciona refresh token.
 *
 * @returns userId se válido, null se inválido
 * @throws se detectar reuse (breach)
 */
export async function rotateRefreshToken(rawToken: string): Promise<{
  userId: string;
  familyId: string;
} | null> {
  const supabase = createSupabaseAdmin();
  const tokenHash = hashToken(rawToken);

  // Busca token pelo hash
  const { data: tokenRecord, error } = await supabase
    .from("refresh_tokens")
    .select("*")
    .eq("token_hash", tokenHash)
    .single();

  if (error || !tokenRecord) {
    return null; // Token não encontrado
  }

  // Check: expirado?
  if (new Date(tokenRecord.expires_at) < new Date()) {
    // Limpa tokens expirados da família
    await supabase
      .from("refresh_tokens")
      .delete()
      .eq("family_id", tokenRecord.family_id);
    return null;
  }

  // Check: já foi usado? → REUSE DETECTED → invalida toda família
  if (tokenRecord.used) {
    console.error(
      `[AUTH] Refresh token reuse detected! family=${tokenRecord.family_id} user=${tokenRecord.user_id}`
    );

    // Invalida TODA a família (possível token theft)
    await supabase
      .from("refresh_tokens")
      .delete()
      .eq("family_id", tokenRecord.family_id);

    // Registra evento de segurança
    await supabase.from("system_events").insert({
      tipo: "security_refresh_token_reuse",
      severidade: "critical",
      mensagem: `Reuso de refresh token detectado para user ${tokenRecord.user_id}. Família invalidada.`,
      metadata: { userId: tokenRecord.user_id, familyId: tokenRecord.family_id },
    });

    return null;
  }

  // Marca como usado (não deleta — necessário para reuse detection)
  await supabase
    .from("refresh_tokens")
    .update({ used: true })
    .eq("id", tokenRecord.id);

  return {
    userId: tokenRecord.user_id,
    familyId: tokenRecord.family_id,
  };
}

/**
 * Invalida todos os refresh tokens de um usuário (logout total)
 */
export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  const supabase = createSupabaseAdmin();
  await supabase.from("refresh_tokens").delete().eq("user_id", userId);
}

/**
 * Cleanup: remove tokens expirados (rodar via cron diário)
 */
export async function cleanupExpiredRefreshTokens(): Promise<number> {
  const supabase = createSupabaseAdmin();
  const { data } = await supabase
    .from("refresh_tokens")
    .delete()
    .lt("expires_at", new Date().toISOString())
    .select("id");

  return data?.length || 0;
}
