-- ============================================================================
-- VIGI — Migration: Tabelas de Prospecção / CRM
-- Data: 2026-03-30
-- ============================================================================

-- ============================================================================
-- 0. Extensão pg_trgm (necessária para busca trigram — deve vir ANTES dos índices)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- 1. Tabela principal de prospects (leads)
-- ============================================================================

CREATE TABLE IF NOT EXISTS prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Dados da empresa (RFB)
  cnpj VARCHAR(14) NOT NULL UNIQUE,
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT,
  cnae_principal VARCHAR(10),
  cnae_descricao TEXT,
  data_abertura VARCHAR(10),
  capital_social NUMERIC(15, 2),
  porte TEXT,

  -- Endereço
  logradouro TEXT,
  numero VARCHAR(20),
  complemento TEXT,
  bairro TEXT,
  cep VARCHAR(10),
  municipio TEXT,
  uf VARCHAR(2),

  -- Contato da empresa
  telefone1 VARCHAR(20),
  telefone2 VARCHAR(20),
  email TEXT,

  -- CRM / Pipeline
  status VARCHAR(20) NOT NULL DEFAULT 'novo'
    CHECK (status IN ('novo', 'contatado', 'qualificado', 'proposta_enviada', 'negociacao', 'ganho', 'perdido')),
  source VARCHAR(20) NOT NULL DEFAULT 'csv_rfb'
    CHECK (source IN ('csv_rfb', 'dou', 'website', 'indicacao', 'outbound', 'evento', 'outro')),
  segmento VARCHAR(10)
    CHECK (segmento IS NULL OR segmento IN ('micro', 'pequena', 'media', 'grande')),
  temperatura VARCHAR(10) NOT NULL DEFAULT 'frio'
    CHECK (temperatura IN ('frio', 'morno', 'quente')),
  score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 100),

  -- Contato comercial (pessoa de contato)
  contato_nome TEXT,
  contato_cargo TEXT,
  contato_telefone VARCHAR(20),
  contato_email TEXT,

  -- Pipeline / negociação
  plano_interesse VARCHAR(20),
  valor_estimado NUMERIC(10, 2),
  motivo_perda TEXT,

  -- Datas de acompanhamento
  ultimo_contato TIMESTAMPTZ,
  proximo_followup DATE,
  data_conversao TIMESTAMPTZ,
  company_id UUID REFERENCES companies(id),

  -- Observações
  notas TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',

  -- Metadata
  importado_por TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. Tabela de atividades do prospect
-- ============================================================================

CREATE TABLE IF NOT EXISTS prospect_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  tipo VARCHAR(20) NOT NULL
    CHECK (tipo IN ('ligacao', 'email', 'reuniao', 'whatsapp', 'nota', 'proposta', 'followup')),
  descricao TEXT NOT NULL,
  resultado TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 3. Índices para performance
-- ============================================================================

-- Busca por CNPJ (único, já criado pelo UNIQUE constraint)
-- CREATE UNIQUE INDEX idx_prospects_cnpj ON prospects(cnpj);

-- Filtros mais comuns no CRM
CREATE INDEX idx_prospects_status ON prospects(status);
CREATE INDEX idx_prospects_temperatura ON prospects(temperatura);
CREATE INDEX idx_prospects_uf ON prospects(uf);
CREATE INDEX idx_prospects_segmento ON prospects(segmento);
CREATE INDEX idx_prospects_source ON prospects(source);
CREATE INDEX idx_prospects_score ON prospects(score DESC);

-- Follow-ups vencidos (query frequente)
CREATE INDEX idx_prospects_followup ON prospects(proximo_followup)
  WHERE proximo_followup IS NOT NULL AND status NOT IN ('ganho', 'perdido');

-- Busca textual (usa pg_trgm se disponível, senão btree fallback)
-- Se pg_trgm não funcionar no seu Supabase, ative em Database > Extensions
-- ou comente esta linha e use apenas o btree abaixo
CREATE INDEX idx_prospects_razao_social ON prospects USING gin(razao_social gin_trgm_ops);
-- Fallback: CREATE INDEX idx_prospects_razao_social ON prospects(razao_social);
CREATE INDEX idx_prospects_municipio ON prospects(municipio);

-- Referência para empresa convertida
CREATE INDEX idx_prospects_company_id ON prospects(company_id)
  WHERE company_id IS NOT NULL;

-- Atividades por prospect
CREATE INDEX idx_prospect_activities_prospect ON prospect_activities(prospect_id);
CREATE INDEX idx_prospect_activities_created ON prospect_activities(created_at DESC);

-- ============================================================================
-- 4. Trigger para updated_at automático
-- ============================================================================

CREATE OR REPLACE FUNCTION update_prospects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prospects_updated_at
  BEFORE UPDATE ON prospects
  FOR EACH ROW
  EXECUTE FUNCTION update_prospects_updated_at();

-- ============================================================================
-- 5. RLS (Row Level Security)
-- ============================================================================

ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_activities ENABLE ROW LEVEL SECURITY;

-- Política: service_role tem acesso total (usado pelas API routes)
CREATE POLICY "Service role full access prospects"
  ON prospects FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access activities"
  ON prospect_activities FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- 6. View de pipeline summary
-- ============================================================================

CREATE OR REPLACE VIEW prospect_pipeline_summary AS
SELECT
  status,
  COUNT(*) as total,
  COUNT(CASE WHEN temperatura = 'quente' THEN 1 END) as quentes,
  COUNT(CASE WHEN temperatura = 'morno' THEN 1 END) as mornos,
  COALESCE(SUM(valor_estimado), 0) as valor_total,
  AVG(score) as score_medio
FROM prospects
WHERE status NOT IN ('ganho', 'perdido')
GROUP BY status
ORDER BY
  CASE status
    WHEN 'novo' THEN 1
    WHEN 'contatado' THEN 2
    WHEN 'qualificado' THEN 3
    WHEN 'proposta_enviada' THEN 4
    WHEN 'negociacao' THEN 5
  END;

-- ============================================================================
-- Fim da migration
-- ============================================================================
