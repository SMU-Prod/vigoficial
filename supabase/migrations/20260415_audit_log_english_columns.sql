-- ──────────────────────────────────────────────────────────────────
-- Fix: audit_log schema mismatch.
--
-- A tabela foi criada com colunas em português (acao, detalhes), mas
-- o código escrito depois usa as variantes em inglês (action, details,
-- entity_type, entity_id) em 10+ arquivos de API. Com os tipos Supabase
-- agora gerados, cada INSERT dispara erro de tipagem.
--
-- Esta migração é aditiva — mantém as colunas antigas mas adiciona as
-- novas em inglês, e relaxa o NOT NULL de `acao` pra permitir inserts
-- que só mandam `action`. Um BEFORE INSERT trigger copia action→acao
-- pra preservar consistência dos dados.
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS action      text,
  ADD COLUMN IF NOT EXISTS details     jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id   text;

-- Afrouxa NOT NULL de acao — agora pode vir só em action
ALTER TABLE audit_log ALTER COLUMN acao DROP NOT NULL;

-- Trigger de sincronização: se vier só action, copia pra acao (e vice-versa)
CREATE OR REPLACE FUNCTION audit_log_sync_en_pt()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.action IS NOT NULL AND NEW.acao IS NULL THEN
    NEW.acao := NEW.action;
  END IF;
  IF NEW.acao IS NOT NULL AND NEW.action IS NULL THEN
    NEW.action := NEW.acao;
  END IF;
  IF NEW.details IS NOT NULL AND NEW.details <> '{}'::jsonb AND (NEW.detalhes IS NULL OR NEW.detalhes = '{}'::jsonb) THEN
    NEW.detalhes := NEW.details;
  END IF;
  IF NEW.detalhes IS NOT NULL AND NEW.detalhes <> '{}'::jsonb AND (NEW.details IS NULL OR NEW.details = '{}'::jsonb) THEN
    NEW.details := NEW.detalhes;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_sync_en_pt_trigger ON audit_log;
CREATE TRIGGER audit_log_sync_en_pt_trigger
BEFORE INSERT OR UPDATE ON audit_log
FOR EACH ROW
EXECUTE FUNCTION audit_log_sync_en_pt();
