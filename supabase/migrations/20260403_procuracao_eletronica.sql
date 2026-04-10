-- ================================================================
-- Procuração Eletrônica — Fluxo de Onboarding GESP
-- ================================================================
-- Quando um prospect é convertido em cliente (Company), é necessário
-- que o CLIENTE cadastre uma procuração eletrônica no GESP autorizando
-- o CPF do consultor VIGI a representá-lo.
--
-- Fluxo:
-- 1. Prospect vira Company → procuracao_status = 'nao_iniciada'
-- 2. Email Template O enviado com instruções passo-a-passo
-- 3. Cliente cadastra no GESP e confirma → status = 'cliente_confirmou'
-- 4. Operador VIGI verifica no GESP → status = 'validada'
-- 5. Company.habilitada = true → GESP sync liberado
-- ================================================================

-- ================================================================
-- 1. Create procuracoes table
-- ================================================================
CREATE TABLE IF NOT EXISTS procuracoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Dados do procurador (quem recebe os poderes - o consultor VIGI)
  cpf_procurador VARCHAR(11) NOT NULL,
  nome_procurador TEXT NOT NULL,

  -- Poderes delegados
  poderes TEXT NOT NULL DEFAULT 'plenos' CHECK (poderes IN ('plenos', 'limitados')),
  poderes_descricao TEXT, -- detalhamento livre dos poderes

  -- Status do fluxo
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN (
    'pendente',           -- email de instrução enviado, aguardando cliente
    'instrucoes_enviadas', -- instruções de como fazer no GESP enviadas
    'cliente_confirmou',  -- cliente informou que cadastrou no GESP
    'validada',           -- operador VIGI verificou no GESP que procuração existe
    'rejeitada',          -- verificação falhou
    'revogada',           -- procuração revogada (pelo cliente ou PF)
    'expirada'            -- expirou prazo sem ação
  )),

  -- Controle
  instrucoes_enviadas_at TIMESTAMPTZ,
  cliente_confirmou_at TIMESTAMPTZ,
  validada_at TIMESTAMPTZ,
  validada_por UUID REFERENCES users(id),
  rejeitada_at TIMESTAMPTZ,
  motivo_rejeicao TEXT,
  revogada_at TIMESTAMPTZ,

  -- Documento
  comprovante_r2_path TEXT, -- screenshot/pdf comprovando cadastro no GESP

  -- Prazo
  prazo_limite DATE, -- prazo para o cliente cadastrar (ex: 7 dias)
  lembrete_enviado BOOLEAN DEFAULT false,

  -- Metadata
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ================================================================
-- Indexes for procuracoes
-- ================================================================
CREATE INDEX idx_procuracoes_company ON procuracoes(company_id);
CREATE INDEX idx_procuracoes_status ON procuracoes(status);
CREATE INDEX idx_procuracoes_cpf ON procuracoes(cpf_procurador);

-- ================================================================
-- 2. Add procuracao_status column to companies
-- ================================================================
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS procuracao_status TEXT DEFAULT 'nao_iniciada'
CHECK (procuracao_status IN ('nao_iniciada', 'pendente', 'validada', 'rejeitada', 'revogada'));

-- ================================================================
-- 3. RLS Policies for procuracoes
-- ================================================================
ALTER TABLE procuracoes ENABLE ROW LEVEL SECURITY;

-- Admins e operadores podem ver todas
CREATE POLICY "procuracoes_select" ON procuracoes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role IN ('admin', 'operador')
    )
  );

-- Admins e operadores podem inserir
CREATE POLICY "procuracoes_insert" ON procuracoes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role IN ('admin', 'operador')
    )
  );

-- Admins e operadores podem atualizar
CREATE POLICY "procuracoes_update" ON procuracoes
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role IN ('admin', 'operador')
    )
  );

-- ================================================================
-- 4. Function to auto-sync procuracao_status to companies
-- ================================================================
CREATE OR REPLACE FUNCTION sync_procuracao_status()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE companies
  SET procuracao_status = NEW.status
  WHERE id = NEW.company_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_procuracao_status
AFTER INSERT OR UPDATE OF status ON procuracoes
FOR EACH ROW
EXECUTE FUNCTION sync_procuracao_status();

-- ================================================================
-- End of migration
-- ================================================================
