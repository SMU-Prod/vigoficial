-- ──────────────────────────────────────────────────────────────────
-- Fix: código referencia colunas users.mfa_secret / users.mfa_ativo
-- que não existem no schema atual. Estas colunas são usadas pelos
-- endpoints /api/auth/mfa/{setup,verify,login,disable} para armazenar
-- o segredo TOTP e o status do MFA por usuário.
--
-- A tabela users já tinha mfa_enabled (boolean), mas o código trata
-- mfa_ativo como o "flag real" (mfa_enabled parecia legacy). Esta
-- migração adiciona as duas colunas ausentes e copia mfa_enabled →
-- mfa_ativo pra preservar o estado existente.
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS mfa_secret text,
  ADD COLUMN IF NOT EXISTS mfa_ativo boolean NOT NULL DEFAULT false;

-- Backfill: migra o valor de mfa_enabled (legacy) para mfa_ativo,
-- assim nenhum usuário perde o setup que já tinha feito.
UPDATE users SET mfa_ativo = mfa_enabled WHERE mfa_ativo = false AND mfa_enabled = true;
