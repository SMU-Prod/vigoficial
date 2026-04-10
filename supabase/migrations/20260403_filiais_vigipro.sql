-- ============================================================================
-- Migration: Filiais (Branches) + VIGIPro Instructions
-- Data: 2026-04-03
-- Descrição: Adiciona suporte a filiais (matriz/filial) nas empresas e
--            instruções customizadas de execução VIGIPro por cliente.
-- ============================================================================

-- 1. Adicionar coluna de vínculo matriz → filial na tabela companies
ALTER TABLE companies
  ADD COLUMN matriz_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN tipo_unidade TEXT NOT NULL DEFAULT 'matriz'
    CHECK (tipo_unidade IN ('matriz', 'filial'));

-- Índice para busca rápida de filiais por matriz
CREATE INDEX idx_companies_matriz_id ON companies(matriz_id) WHERE matriz_id IS NOT NULL;

-- Constraint: uma filial não pode ser matriz de outra (self-reference depth = 1)
-- e uma matriz não pode ter matriz_id preenchido
ALTER TABLE companies
  ADD CONSTRAINT chk_filial_consistency
  CHECK (
    (tipo_unidade = 'matriz' AND matriz_id IS NULL)
    OR
    (tipo_unidade = 'filial' AND matriz_id IS NOT NULL)
  );

-- 2. Tabela de instruções VIGIPro por empresa (cliente)
-- Cada empresa (normalmente a matriz) pode ter instruções customizadas
-- descrevendo como o VIGIPro deve proceder com aquele cliente e suas filiais.
CREATE TABLE company_instructions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  titulo          TEXT NOT NULL,
  conteudo        TEXT NOT NULL,
  categoria       TEXT NOT NULL DEFAULT 'geral'
    CHECK (categoria IN ('geral', 'gesp', 'monitoramento', 'financeiro', 'comunicacao')),
  ativo           BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID REFERENCES users(id),
  updated_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_company_instructions_company ON company_instructions(company_id);
CREATE INDEX idx_company_instructions_active ON company_instructions(company_id, ativo) WHERE ativo = true;

-- 3. Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_company_instructions_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_company_instructions_updated
  BEFORE UPDATE ON company_instructions
  FOR EACH ROW
  EXECUTE FUNCTION update_company_instructions_timestamp();

-- 4. RLS (Row Level Security)
ALTER TABLE company_instructions ENABLE ROW LEVEL SECURITY;

-- Admin: acesso total
CREATE POLICY "admin_full_access_instructions"
  ON company_instructions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Operador: leitura das empresas autorizadas
CREATE POLICY "operador_read_instructions"
  ON company_instructions
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT unnest(company_ids) FROM users WHERE id = auth.uid()
    )
  );

-- 5. Comentários para documentação
COMMENT ON COLUMN companies.matriz_id IS 'FK para a empresa matriz. NULL = esta empresa é uma matriz.';
COMMENT ON COLUMN companies.tipo_unidade IS 'Tipo da unidade: matriz ou filial.';
COMMENT ON TABLE company_instructions IS 'Instruções customizadas de execução VIGIPro por cliente.';
COMMENT ON COLUMN company_instructions.categoria IS 'Categoria: geral, gesp, monitoramento, financeiro, comunicacao.';
