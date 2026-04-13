-- ============================================================================
-- Migration: Auditoria VIG PRO — Correções completas
-- Data: 2026-04-13
-- ============================================================================

-- 1. Campos de contrato na tabela companies
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS contrato_inicio DATE,
  ADD COLUMN IF NOT EXISTS contrato_vencimento DATE,
  ADD COLUMN IF NOT EXISTS contrato_auto_renovacao BOOLEAN DEFAULT true;

-- 2. Flag para envio de alertas ao vigilante (autorizado pelo cliente)
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS enviar_alerta_vigilante BOOLEAN DEFAULT false;

-- 3. Atualizar enum de planos (starter→essencial, professional→profissional)
-- Nota: se a coluna plano usa text (não enum), basta atualizar os dados
UPDATE companies SET plano = 'essencial' WHERE plano = 'starter';
UPDATE companies SET plano = 'profissional' WHERE plano = 'professional';

-- 4. Email e telefone do procurador (representante legal)
ALTER TABLE gesp_procuradores
  ADD COLUMN IF NOT EXISTS email_procurador TEXT,
  ADD COLUMN IF NOT EXISTS telefone_procurador TEXT;

-- 5. Email do vigilante (para receber alertas quando autorizado)
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS receber_alertas BOOLEAN DEFAULT false;

-- 6. Índices para performance
CREATE INDEX IF NOT EXISTS idx_companies_contrato_vencimento
  ON companies (contrato_vencimento)
  WHERE habilitada = true;

CREATE INDEX IF NOT EXISTS idx_employees_email
  ON employees (email)
  WHERE email IS NOT NULL;

-- 7. Comentários para documentação do schema
COMMENT ON COLUMN companies.contrato_inicio IS 'Data de início do contrato (ativação após 1º pagamento)';
COMMENT ON COLUMN companies.contrato_vencimento IS 'Data de vencimento do contrato (30 dias após pagamento)';
COMMENT ON COLUMN companies.contrato_auto_renovacao IS 'Se true, contrato renova automaticamente após pagamento';
COMMENT ON COLUMN companies.enviar_alerta_vigilante IS 'Se true, envia alertas de compliance diretamente ao vigilante';
COMMENT ON COLUMN gesp_procuradores.email_procurador IS 'Email do representante legal/procurador';
COMMENT ON COLUMN gesp_procuradores.telefone_procurador IS 'Telefone do representante legal/procurador';
COMMENT ON COLUMN employees.email IS 'Email do vigilante para receber alertas (quando autorizado)';
COMMENT ON COLUMN employees.receber_alertas IS 'Se true, vigilante recebe alertas de compliance diretamente';
