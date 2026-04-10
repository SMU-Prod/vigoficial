-- =============================================================================
-- VIGI PRO — Refresh Token Rotation
-- Tabela para armazenar refresh tokens (hash only) com reuse detection.
-- =============================================================================

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Armazena SHA-256 hash do token (NUNCA o token raw)
  token_hash TEXT NOT NULL UNIQUE,

  -- Família: todos os tokens de uma mesma sessão de login
  -- Se um token usado for reutilizado, toda a família é invalidada
  family_id TEXT NOT NULL,

  -- Expiração
  expires_at TIMESTAMPTZ NOT NULL,

  -- Marca se já foi usado (para reuse detection)
  used BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_family ON refresh_tokens(family_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at) WHERE used = FALSE;

-- Cleanup function (rodar via cron)
CREATE OR REPLACE FUNCTION cleanup_expired_refresh_tokens()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM refresh_tokens WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
