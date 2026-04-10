-- =============================================================================
-- VIGI PRO — Institutional Memory Layer (IML)
-- 3 componentes: Event Graph, Pattern Distiller, Adaptive Playbook
-- =============================================================================

-- ─── 1. EVENT GRAPH ─────────────────────────────────────────────────────────
-- Registra todos os eventos do sistema como um grafo causal.
-- Cada ação de agente, publicação do DOU, processo GESP, comunicação, etc.
-- se torna um nó conectado a outros eventos por relações causais.

CREATE TABLE IF NOT EXISTS iml_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Tipo do evento (enum-like para queries eficientes)
  event_type TEXT NOT NULL CHECK (event_type IN (
    'PUBLICACAO_DOU',      -- Publicação encontrada no DOU
    'PROCESSO_GESP',       -- Ação no portal GESP
    'VENCIMENTO',          -- Vencimento de documento/alvará
    'COMUNICACAO_CLIENTE',  -- Email/ofício enviado/recebido
    'DECISAO_AGENTE',      -- Decisão tomada por um agente
    'ESCALACAO_HUMANA',    -- Escalonamento para revisão humana
    'COMPLIANCE_CHECK',    -- Verificação de conformidade
    'PROSPECT_QUALIFICADO', -- Prospect qualificado pelo Captador
    'WORKFLOW_INICIADO',   -- Workflow de demanda iniciado
    'WORKFLOW_CONCLUIDO',  -- Workflow concluído
    'ERRO_SISTEMA',        -- Erro em qualquer componente
    'INSIGHT_GERADO',      -- Insight gerado pelo Pattern Distiller
    'PLAYBOOK_AJUSTE',     -- Ajuste do Adaptive Playbook aplicado
    'ADMIN_ACAO'           -- Ação manual do admin
  )),

  -- Entidade relacionada (polimórfico)
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'company', 'employee', 'agent_run', 'email', 'gesp_task',
    'dou_item', 'prospect', 'workflow', 'document', 'system'
  )),
  entity_id TEXT, -- UUID ou ID externo da entidade

  -- Agente que gerou o evento (null se for evento externo)
  agent_name TEXT CHECK (agent_name IN ('captador', 'operacional', 'comunicador', 'orquestrador')),
  agent_run_id UUID, -- Referência ao agent_runs.id

  -- Empresa relacionada (para queries por empresa)
  company_id UUID,

  -- Dados do evento (flexível, específico por event_type)
  metadata JSONB NOT NULL DEFAULT '{}',

  -- Severidade para priorização
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),

  -- Timestamps
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Índices de busca textual nos metadados
  search_text TEXT GENERATED ALWAYS AS (
    COALESCE(metadata->>'resumo', '') || ' ' ||
    COALESCE(metadata->>'descricao', '') || ' ' ||
    COALESCE(metadata->>'razao_social', '')
  ) STORED
);

-- Edges: relações causais entre eventos
CREATE TABLE IF NOT EXISTS iml_event_edges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  source_event_id UUID NOT NULL REFERENCES iml_events(id) ON DELETE CASCADE,
  target_event_id UUID NOT NULL REFERENCES iml_events(id) ON DELETE CASCADE,

  -- Tipo da relação causal
  relation_type TEXT NOT NULL CHECK (relation_type IN (
    'CAUSOU',       -- Evento A causou diretamente o evento B
    'PRECEDEU',     -- Evento A aconteceu antes de B (correlação temporal)
    'BLOQUEOU',     -- Evento A impediu evento B de acontecer
    'RESOLVEU',     -- Evento A resolveu o problema de B
    'ESCALOU',      -- Evento A gerou escalonamento B
    'REVERTEU',     -- Evento A reverteu os efeitos de B
    'COMPLEMENTOU', -- Evento A complementou informação de B
    'SIMILAR'       -- Eventos A e B são padrões similares
  )),

  -- Confiança da relação (1.0 = determinístico, 0.5 = inferido)
  confidence FLOAT NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),

  -- Metadados da relação
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(source_event_id, target_event_id, relation_type)
);

-- ─── 2. PATTERN DISTILLER — INSIGHTS ────────────────────────────────────────
-- Padrões extraídos pelo Pattern Distiller.
-- Cada insight é uma observação sobre o comportamento do sistema que pode
-- se tornar uma ação automática quando aprovada pelo admin.

CREATE TABLE IF NOT EXISTS iml_insights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Classificação do insight
  insight_type TEXT NOT NULL CHECK (insight_type IN (
    'TIMING_PATTERN',      -- Padrão temporal (ex: DOU publica terças/quintas)
    'PERFORMANCE_PATTERN',  -- Padrão de performance (ex: DESP X mais lento)
    'BEHAVIORAL_PATTERN',  -- Padrão comportamental (ex: empresa Y atrasa docs)
    'CORRELATION',          -- Correlação entre eventos (ex: email urgente → resposta rápida)
    'ANOMALY',             -- Anomalia detectada (ex: taxa de falha incomum)
    'OPTIMIZATION',        -- Oportunidade de otimização
    'RISK_SIGNAL',         -- Sinal de risco (ex: múltiplos vencimentos próximos)
    'RECOMMENDATION'       -- Recomendação genérica
  )),

  -- Título curto e descrição detalhada
  title TEXT NOT NULL,
  description TEXT NOT NULL,

  -- Ação sugerida (em linguagem natural)
  suggested_action TEXT,

  -- Parâmetros ajustáveis (para o Adaptive Playbook)
  -- Ex: { "rule": "R8", "param": "backoff_seconds", "current": 30, "suggested": 120, "context": "14h-16h" }
  suggested_params JSONB DEFAULT '{}',

  -- Evidências que suportam o insight
  evidence_count INT NOT NULL DEFAULT 0,
  evidence_event_ids UUID[] DEFAULT '{}', -- IDs dos eventos que evidenciam

  -- Confiança (cresce com mais evidências)
  confidence FLOAT NOT NULL DEFAULT 0.0 CHECK (confidence >= 0 AND confidence <= 1),

  -- Status do insight
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',         -- Aguardando mais evidências
    'ready',           -- Confiança suficiente, aguardando aprovação
    'admin_approved',  -- Aprovado pelo admin
    'admin_rejected',  -- Rejeitado pelo admin
    'applied',         -- Aplicado ao Adaptive Playbook
    'expired',         -- Expirado (padrão não se repete mais)
    'superseded'       -- Substituído por insight mais recente
  )),

  -- Aprovação do admin (TODAS as ações requerem confirmação)
  admin_approved BOOLEAN NOT NULL DEFAULT FALSE,
  admin_approved_by UUID, -- users.id do admin
  admin_approved_at TIMESTAMPTZ,
  admin_notes TEXT,

  -- Agente e empresa relacionados (para filtros)
  related_agent TEXT CHECK (related_agent IN ('captador', 'operacional', 'comunicador', 'orquestrador')),
  related_company_id UUID,

  -- Impacto estimado
  impact_level TEXT DEFAULT 'medium' CHECK (impact_level IN ('critical', 'high', 'medium', 'low')),

  -- Controle de versão (insights podem evoluir)
  version INT NOT NULL DEFAULT 1,
  parent_insight_id UUID REFERENCES iml_insights(id),

  -- Timestamps
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_evidence_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- Auto-expira se não se repete
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 3. ADAPTIVE PLAYBOOK ───────────────────────────────────────────────────
-- Parametrizações dinâmicas das 12 regras R1-R12.
-- Não substitui regras — as parametriza baseado em insights aprovados.

CREATE TABLE IF NOT EXISTS iml_playbook_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Regra base afetada (R1-R12)
  rule_code TEXT NOT NULL CHECK (rule_code ~ '^R[0-9]{1,2}$'),

  -- Parâmetro sendo ajustado
  param_name TEXT NOT NULL,

  -- Valores
  default_value JSONB NOT NULL,     -- Valor padrão da regra
  adjusted_value JSONB NOT NULL,    -- Valor ajustado pelo Playbook

  -- Contexto de aplicação (quando aplicar o ajuste)
  -- Ex: { "time_range": "14:00-16:00", "company_id": "xxx", "desp": "Niterói" }
  apply_context JSONB NOT NULL DEFAULT '{}',

  -- Insight que originou este ajuste
  source_insight_id UUID REFERENCES iml_insights(id),

  -- REQUER aprovação do admin
  active BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by UUID,
  approved_at TIMESTAMPTZ,

  -- Efetividade
  times_applied INT NOT NULL DEFAULT 0,
  last_applied_at TIMESTAMPTZ,
  effectiveness_score FLOAT, -- 0-1, calculado após aplicações

  -- Metadata
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(rule_code, param_name, apply_context)
);

-- Histórico de aplicações do Playbook (audit trail)
CREATE TABLE IF NOT EXISTS iml_playbook_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  playbook_rule_id UUID NOT NULL REFERENCES iml_playbook_rules(id),
  agent_run_id UUID, -- agent_runs.id quando aplicado durante uma run

  -- O que foi aplicado
  rule_code TEXT NOT NULL,
  param_name TEXT NOT NULL,
  original_value JSONB NOT NULL,
  applied_value JSONB NOT NULL,
  apply_context JSONB NOT NULL DEFAULT '{}',

  -- Resultado
  outcome TEXT CHECK (outcome IN ('success', 'neutral', 'negative', 'unknown')),
  outcome_details JSONB,

  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── ÍNDICES ─────────────────────────────────────────────────────────────────

-- Events
CREATE INDEX IF NOT EXISTS idx_iml_events_type ON iml_events(event_type);
CREATE INDEX IF NOT EXISTS idx_iml_events_entity ON iml_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_iml_events_agent ON iml_events(agent_name);
CREATE INDEX IF NOT EXISTS idx_iml_events_company ON iml_events(company_id);
CREATE INDEX IF NOT EXISTS idx_iml_events_occurred ON iml_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_iml_events_severity ON iml_events(severity) WHERE severity IN ('critical', 'high');
CREATE INDEX IF NOT EXISTS idx_iml_events_metadata ON iml_events USING gin(metadata);

-- Event Edges
CREATE INDEX IF NOT EXISTS idx_iml_edges_source ON iml_event_edges(source_event_id);
CREATE INDEX IF NOT EXISTS idx_iml_edges_target ON iml_event_edges(target_event_id);
CREATE INDEX IF NOT EXISTS idx_iml_edges_type ON iml_event_edges(relation_type);

-- Insights
CREATE INDEX IF NOT EXISTS idx_iml_insights_type ON iml_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_iml_insights_status ON iml_insights(status);
CREATE INDEX IF NOT EXISTS idx_iml_insights_confidence ON iml_insights(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_iml_insights_agent ON iml_insights(related_agent);
CREATE INDEX IF NOT EXISTS idx_iml_insights_ready ON iml_insights(status, confidence)
  WHERE status = 'ready' AND confidence >= 0.85;

-- Playbook
CREATE INDEX IF NOT EXISTS idx_iml_playbook_rule ON iml_playbook_rules(rule_code);
CREATE INDEX IF NOT EXISTS idx_iml_playbook_active ON iml_playbook_rules(active) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_iml_playbook_log_rule ON iml_playbook_log(playbook_rule_id);
CREATE INDEX IF NOT EXISTS idx_iml_playbook_log_run ON iml_playbook_log(agent_run_id);

-- ─── VIEWS ───────────────────────────────────────────────────────────────────

-- View: Insights prontos para aprovação do admin
CREATE OR REPLACE VIEW vw_iml_insights_pending AS
SELECT
  i.*,
  array_length(i.evidence_event_ids, 1) as total_evidence,
  CASE
    WHEN i.confidence >= 0.95 THEN 'Muito Alta'
    WHEN i.confidence >= 0.85 THEN 'Alta'
    WHEN i.confidence >= 0.70 THEN 'Média'
    ELSE 'Baixa'
  END as confidence_label
FROM iml_insights i
WHERE i.status IN ('pending', 'ready')
  AND i.confidence >= 0.5
ORDER BY i.confidence DESC, i.evidence_count DESC;

-- View: Event Graph com contagem de edges
CREATE OR REPLACE VIEW vw_iml_event_summary AS
SELECT
  e.id,
  e.event_type,
  e.entity_type,
  e.agent_name,
  e.company_id,
  e.severity,
  e.occurred_at,
  e.metadata,
  (SELECT COUNT(*) FROM iml_event_edges ee WHERE ee.source_event_id = e.id) as outgoing_edges,
  (SELECT COUNT(*) FROM iml_event_edges ee WHERE ee.target_event_id = e.id) as incoming_edges
FROM iml_events e
ORDER BY e.occurred_at DESC;

-- View: Playbook rules ativos com efetividade
CREATE OR REPLACE VIEW vw_iml_playbook_active AS
SELECT
  pr.*,
  i.title as insight_title,
  i.confidence as insight_confidence,
  (SELECT COUNT(*) FROM iml_playbook_log pl WHERE pl.playbook_rule_id = pr.id) as total_applications,
  (SELECT COUNT(*) FROM iml_playbook_log pl WHERE pl.playbook_rule_id = pr.id AND pl.outcome = 'success') as successful_applications
FROM iml_playbook_rules pr
LEFT JOIN iml_insights i ON i.id = pr.source_insight_id
WHERE pr.active = TRUE
ORDER BY pr.times_applied DESC;

-- ─── FUNCTIONS ───────────────────────────────────────────────────────────────

-- Função: Emitir evento e criar edges automaticamente
CREATE OR REPLACE FUNCTION iml_emit_event(
  p_event_type TEXT,
  p_entity_type TEXT,
  p_entity_id TEXT,
  p_agent_name TEXT DEFAULT NULL,
  p_agent_run_id UUID DEFAULT NULL,
  p_company_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}',
  p_severity TEXT DEFAULT 'info',
  p_caused_by_event_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO iml_events (
    event_type, entity_type, entity_id, agent_name,
    agent_run_id, company_id, metadata, severity
  ) VALUES (
    p_event_type, p_entity_type, p_entity_id, p_agent_name,
    p_agent_run_id, p_company_id, p_metadata, p_severity
  ) RETURNING id INTO v_event_id;

  -- Se tem evento causador, cria edge automática
  IF p_caused_by_event_id IS NOT NULL THEN
    INSERT INTO iml_event_edges (source_event_id, target_event_id, relation_type)
    VALUES (p_caused_by_event_id, v_event_id, 'CAUSOU')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- Função: Atualizar confiança de insight baseado em novas evidências
CREATE OR REPLACE FUNCTION iml_update_insight_confidence(
  p_insight_id UUID,
  p_new_evidence_event_id UUID
) RETURNS VOID AS $$
DECLARE
  v_count INT;
  v_confidence FLOAT;
BEGIN
  -- Adiciona evidência
  UPDATE iml_insights
  SET evidence_event_ids = array_append(evidence_event_ids, p_new_evidence_event_id),
      evidence_count = evidence_count + 1,
      last_evidence_at = NOW(),
      updated_at = NOW()
  WHERE id = p_insight_id;

  -- Recalcula confiança: fórmula logarítmica que satura em ~0.95
  SELECT evidence_count INTO v_count FROM iml_insights WHERE id = p_insight_id;
  v_confidence := LEAST(0.95, 0.3 + 0.65 * (1 - EXP(-0.3 * v_count)));

  UPDATE iml_insights
  SET confidence = v_confidence,
      status = CASE
        WHEN v_confidence >= 0.85 AND evidence_count >= 5 THEN 'ready'
        ELSE status
      END
  WHERE id = p_insight_id
    AND status NOT IN ('admin_approved', 'admin_rejected', 'applied', 'expired');
END;
$$ LANGUAGE plpgsql;
