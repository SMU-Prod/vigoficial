-- =============================================================================
-- VIGI PRO — Adiciona campos de enriquecimento BrasilAPI na tabela companies
-- =============================================================================

-- Dados extras que a BrasilAPI retorna e são úteis para compliance
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS cnae_principal VARCHAR(10),
  ADD COLUMN IF NOT EXISTS cnae_descricao TEXT,
  ADD COLUMN IF NOT EXISTS capital_social NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS porte TEXT,
  ADD COLUMN IF NOT EXISTS data_abertura VARCHAR(10),
  ADD COLUMN IF NOT EXISTS natureza_juridica TEXT,
  ADD COLUMN IF NOT EXISTS logradouro TEXT,
  ADD COLUMN IF NOT EXISTS numero VARCHAR(20),
  ADD COLUMN IF NOT EXISTS complemento TEXT,
  ADD COLUMN IF NOT EXISTS bairro TEXT,
  ADD COLUMN IF NOT EXISTS cep VARCHAR(10),
  ADD COLUMN IF NOT EXISTS municipio TEXT,
  ADD COLUMN IF NOT EXISTS situacao_cadastral TEXT,
  ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ;

-- Index para buscar companies não enriquecidas
CREATE INDEX IF NOT EXISTS idx_companies_not_enriched
  ON companies(enriched_at) WHERE enriched_at IS NULL;
