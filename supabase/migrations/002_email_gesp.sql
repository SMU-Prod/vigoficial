-- =============================================================================
-- VIGI SQL 02 — EMAIL, GESP, WORKFLOWS
-- email_inbound, email_outbound, email_workflows,
-- gesp_sessions, gesp_tasks, gesp_snapshots, gesp_holidays,
-- discrepancies, pf_requests
-- =============================================================================

-- =============================================================================
-- EMAIL_INBOUND
-- PRD Regra R2: Email salvo IMEDIATAMENTE, ANTES de qualquer processamento
-- =============================================================================
CREATE TABLE email_inbound (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID REFERENCES companies(id) ON DELETE SET NULL,
  gmail_message_id  TEXT NOT NULL UNIQUE,
  from_email        TEXT NOT NULL,
  to_email          TEXT,
  subject           TEXT NOT NULL,
  body_text         TEXT NOT NULL,
  body_html         TEXT,
  attachments       JSONB DEFAULT '[]',    -- [{filename, mime, r2_path, size}]
  received_at       TIMESTAMPTZ NOT NULL,
  -- Parser IA (PRD Seção 3.3)
  status            TEXT NOT NULL DEFAULT 'recebido'
                    CHECK (status IN ('recebido', 'processado', 'erro')),
  parser_resultado  JSONB,
  tipo_demanda      TEXT,
  confidence_score  NUMERIC(3,2),          -- 0.00 a 1.00
  workflow_id       UUID,                  -- Preenchido após criar workflow
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_inbound_company ON email_inbound(company_id);
CREATE INDEX idx_email_inbound_status ON email_inbound(status);
CREATE INDEX idx_email_inbound_received ON email_inbound(received_at DESC);
CREATE INDEX idx_email_inbound_tipo ON email_inbound(tipo_demanda);

-- =============================================================================
-- EMAIL_OUTBOUND
-- PRD Seção 3.6 — Sistema de Email e Comunicações
-- Regra R11: Separação absoluta CLIENTE_HTML vs OFICIO_PF
-- =============================================================================
CREATE TABLE email_outbound (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  template_id     TEXT NOT NULL
                  CHECK (template_id IN (
                    'A', 'B', 'C', 'D', 'E', 'F', 'G',
                    'OF-A', 'OF-B', 'OF-C', 'OF-D', 'OF-E'
                  )),
  mode            TEXT NOT NULL
                  CHECK (mode IN ('CLIENTE_HTML', 'OFICIO_PF')),
  from_email      TEXT NOT NULL,
  to_email        TEXT NOT NULL,
  cc_email        TEXT,
  subject         TEXT NOT NULL,
  body_html       TEXT,
  body_text       TEXT,
  attachments     JSONB DEFAULT '[]',
  -- Resend
  resend_id       TEXT,
  status          TEXT NOT NULL DEFAULT 'pendente'
                  CHECK (status IN ('pendente', 'enviado', 'erro')),
  erro_detalhe    TEXT,
  -- Referência
  workflow_id     UUID,
  gesp_task_id    UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at         TIMESTAMPTZ
);

CREATE INDEX idx_email_outbound_company ON email_outbound(company_id);
CREATE INDEX idx_email_outbound_template ON email_outbound(template_id);
CREATE INDEX idx_email_outbound_status ON email_outbound(status);
CREATE INDEX idx_email_outbound_sent ON email_outbound(sent_at DESC);

-- =============================================================================
-- EMAIL_WORKFLOWS
-- PRD Seção 3.3 — Parser IA classifica e cria workflows
-- Regra R7: Caso desconhecido → Template E
-- Regra R8: Confirmação obrigatória (Template B) após cada ação
-- Regra R10: URGENTE → ciclo imediato
-- =============================================================================
CREATE TABLE email_workflows (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email_inbound_id  UUID REFERENCES email_inbound(id) ON DELETE SET NULL,
  tipo_demanda      TEXT NOT NULL,
  prioridade        TEXT NOT NULL DEFAULT 'normal'
                    CHECK (prioridade IN ('normal', 'urgente')),
  status            TEXT NOT NULL DEFAULT 'recebido'
                    CHECK (status IN (
                      'recebido', 'classificado', 'aguardando_aprovacao',
                      'aprovado', 'executando', 'concluido',
                      'erro', 'caso_desconhecido'
                    )),
  dados_extraidos   JSONB NOT NULL DEFAULT '{}',
  -- Aprovação
  aprovado_por      UUID REFERENCES users(id) ON DELETE SET NULL,
  aprovado_em       TIMESTAMPTZ,
  -- Execução
  gesp_task_ids     UUID[] DEFAULT '{}',
  email_outbound_ids UUID[] DEFAULT '{}',
  -- Erro
  erro_detalhe      TEXT,
  -- Timestamps
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflows_company ON email_workflows(company_id);
CREATE INDEX idx_workflows_status ON email_workflows(status);
CREATE INDEX idx_workflows_prioridade ON email_workflows(prioridade);
CREATE INDEX idx_workflows_tipo ON email_workflows(tipo_demanda);
CREATE INDEX idx_workflows_created ON email_workflows(created_at DESC);

CREATE TRIGGER trg_workflows_updated_at BEFORE UPDATE ON email_workflows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- GESP_SESSIONS
-- PRD Regra R5: Máx. 1 sessão por empresa, 3 browsers no servidor
-- =============================================================================
CREATE TABLE gesp_sessions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  browser_pid   INTEGER,
  status        TEXT NOT NULL DEFAULT 'ativo'
                CHECK (status IN ('ativo', 'finalizado', 'erro')),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  erro_detalhe  TEXT,
  -- Métricas
  acoes_executadas  INTEGER DEFAULT 0,
  prints_capturados INTEGER DEFAULT 0,
  tempo_total_ms    INTEGER
);

CREATE INDEX idx_gesp_sessions_company ON gesp_sessions(company_id);
CREATE INDEX idx_gesp_sessions_status ON gesp_sessions(status);

-- =============================================================================
-- GESP_TASKS
-- PRD Seção 3.2 — Integração GESP (Polícia Federal)
-- Cada ação no GESP é uma task individual com prints antes/depois
-- =============================================================================
CREATE TABLE gesp_tasks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  session_id      UUID REFERENCES gesp_sessions(id) ON DELETE SET NULL,
  workflow_id     UUID REFERENCES email_workflows(id) ON DELETE SET NULL,
  tipo_acao       TEXT NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'pendente'
                  CHECK (status IN ('pendente', 'executando', 'concluido', 'erro', 'retry')),
  tentativas      INTEGER NOT NULL DEFAULT 0,
  max_tentativas  INTEGER NOT NULL DEFAULT 5,
  -- Evidências (PRD Regra R1: prints duplos)
  print_antes_r2  TEXT,
  print_depois_r2 TEXT,
  print_erro_r2   TEXT,
  protocolo_gesp  TEXT,
  -- Erro
  erro_detalhe    TEXT,
  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  executed_at     TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_gesp_tasks_company ON gesp_tasks(company_id);
CREATE INDEX idx_gesp_tasks_session ON gesp_tasks(session_id);
CREATE INDEX idx_gesp_tasks_status ON gesp_tasks(status);
CREATE INDEX idx_gesp_tasks_workflow ON gesp_tasks(workflow_id);

-- =============================================================================
-- GESP_SNAPSHOTS
-- PRD Seção 3.2 — Snapshot completo de cada empresa a cada ciclo
-- =============================================================================
CREATE TABLE gesp_snapshots (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  session_id    UUID REFERENCES gesp_sessions(id) ON DELETE SET NULL,
  snapshot_data JSONB NOT NULL,          -- Estado completo da empresa no GESP
  vigilantes_count INTEGER DEFAULT 0,
  postos_count     INTEGER DEFAULT 0,
  armas_count      INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gesp_snapshots_company ON gesp_snapshots(company_id);
CREATE INDEX idx_gesp_snapshots_created ON gesp_snapshots(created_at DESC);

-- =============================================================================
-- GESP_HOLIDAYS
-- Feriados nacionais — GESP pode ter comportamento diferente
-- =============================================================================
CREATE TABLE gesp_holidays (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  data        DATE NOT NULL UNIQUE,
  descricao   TEXT NOT NULL,
  tipo        TEXT DEFAULT 'nacional'
              CHECK (tipo IN ('nacional', 'ponto_facultativo'))
);

-- Feriados 2026
INSERT INTO gesp_holidays (data, descricao) VALUES
  ('2026-01-01', 'Confraternização Universal'),
  ('2026-02-16', 'Carnaval'),
  ('2026-02-17', 'Carnaval'),
  ('2026-04-03', 'Sexta-feira Santa'),
  ('2026-04-21', 'Tiradentes'),
  ('2026-05-01', 'Dia do Trabalho'),
  ('2026-06-04', 'Corpus Christi'),
  ('2026-09-07', 'Independência do Brasil'),
  ('2026-10-12', 'Nossa Senhora Aparecida'),
  ('2026-11-02', 'Finados'),
  ('2026-11-15', 'Proclamação da República'),
  ('2026-12-25', 'Natal');

-- =============================================================================
-- DISCREPANCIES
-- PRD Seção 9.7 — Divergência Detectada no GESP
-- Regra R1: NUNCA ADAPTAR DADOS — prints duplos obrigatórios
-- =============================================================================
CREATE TABLE discrepancies (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id           UUID REFERENCES employees(id) ON DELETE SET NULL,
  gesp_task_id          UUID REFERENCES gesp_tasks(id) ON DELETE SET NULL,
  tipo_incompatibilidade TEXT NOT NULL,
  campo_divergente      TEXT NOT NULL,     -- Ex: 'nome_completo', 'cpf'
  valor_sistema         TEXT,              -- Valor no banco VIGI
  valor_gesp            TEXT,              -- Valor encontrado no GESP
  -- Evidências obrigatórias
  print_documento_r2    TEXT NOT NULL,     -- Print 1: documento original
  print_gesp_r2         TEXT NOT NULL,     -- Print 2: tela GESP
  print_erro_r2         TEXT,              -- Print 3: mensagem de erro
  -- Ofício OF-D
  oficio_id             UUID REFERENCES email_outbound(id),
  delesp_uf             CHAR(2),
  -- Acompanhamento
  status                TEXT NOT NULL DEFAULT 'aberta'
                        CHECK (status IN ('aberta', 'comunicada', 'resolvida', 'arquivada')),
  prazo_resposta_pf     DATE,             -- 15 dias úteis
  resolucao_detalhe     TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at           TIMESTAMPTZ
);

CREATE INDEX idx_discrepancies_company ON discrepancies(company_id);
CREATE INDEX idx_discrepancies_status ON discrepancies(status);
CREATE INDEX idx_discrepancies_employee ON discrepancies(employee_id);

-- =============================================================================
-- PF_REQUESTS (Comunicações formais com PF)
-- PRD Seção 3.6 — Ofícios OF-A a OF-E
-- =============================================================================
CREATE TABLE pf_requests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tipo_oficio     TEXT NOT NULL
                  CHECK (tipo_oficio IN ('OF-A', 'OF-B', 'OF-C', 'OF-D', 'OF-E')),
  delesp_uf       CHAR(2) NOT NULL,
  delesp_email    TEXT NOT NULL,
  assunto         TEXT NOT NULL,
  corpo_texto     TEXT NOT NULL,         -- SEMPRE plain text (Regra R11)
  attachments_r2  TEXT[] DEFAULT '{}',
  -- Referências
  workflow_id     UUID REFERENCES email_workflows(id),
  email_outbound_id UUID REFERENCES email_outbound(id),
  -- Status
  status          TEXT NOT NULL DEFAULT 'rascunho'
                  CHECK (status IN ('rascunho', 'enviado', 'confirmado', 'respondido')),
  protocolo       TEXT,
  resposta_pf     TEXT,
  respondido_em   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at         TIMESTAMPTZ
);

CREATE INDEX idx_pf_requests_company ON pf_requests(company_id);
CREATE INDEX idx_pf_requests_tipo ON pf_requests(tipo_oficio);
CREATE INDEX idx_pf_requests_status ON pf_requests(status);
CREATE INDEX idx_pf_requests_delesp ON pf_requests(delesp_uf);
