-- ──────────────────────────────────────────────────────────────────
-- Consolida colunas que o código usa mas não existem no schema real.
-- Expôs com o wiring dos tipos Supabase gerados. Ordena por frequência
-- de erros no typecheck do CI.
--
-- Aplicar no SQL Editor do Supabase depois de regenerar os tipos.
-- ──────────────────────────────────────────────────────────────────

-- ─── companies ───
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS email_contato            text,
  ADD COLUMN IF NOT EXISTS enviar_alerta_vigilante  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contrato_inicio          date,
  ADD COLUMN IF NOT EXISTS contrato_vencimento      date,
  ADD COLUMN IF NOT EXISTS contrato_auto_renovacao  boolean NOT NULL DEFAULT true;

-- Código legado em billing-service usa nomes em inglês; DB usa portugues
-- (valor_mensal, data_proxima_cobranca). Adiciona aliases como colunas
-- geradas — ficam sempre sincronizadas, sem trigger.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS monthly_cost       numeric GENERATED ALWAYS AS (valor_mensal)           STORED,
  ADD COLUMN IF NOT EXISTS next_billing_date  date    GENERATED ALWAYS AS (data_proxima_cobranca) STORED;
-- last_payment_date não tem fonte direta; fica como coluna simples pra o
-- billing-service preencher manualmente quando registra pagamento.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS last_payment_date  date;

-- ─── employees ───
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS receber_alertas       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pis                   text,
  ADD COLUMN IF NOT EXISTS vinculo_empregaticio  text,
  ADD COLUMN IF NOT EXISTS situacao_pessoa       text,
  ADD COLUMN IF NOT EXISTS cargo_gesp            text;

-- ─── prospects ───
ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS email_contato text;

-- ─── billing (alias de billing_history) ───
-- Código em billing-service.ts usa tabela "billing"; a real é "billing_history".
-- Cria view read-only como alias, alinhada com os nomes de coluna em inglês
-- que o código espera (amount, status, due_date, paid_date).
CREATE OR REPLACE VIEW billing AS
SELECT
  id,
  company_id,
  valor       AS amount,
  status,
  asaas_payment_id,
  metodo_pagamento,
  data_vencimento AS due_date,
  data_pagamento  AS paid_date,
  created_at
FROM billing_history;

COMMENT ON VIEW billing IS 'Alias de billing_history com colunas em inglês. Use billing_history para INSERT/UPDATE.';
