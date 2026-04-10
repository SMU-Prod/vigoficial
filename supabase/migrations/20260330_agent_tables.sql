-- ============================================
-- VIGI - Tabelas de Monitoramento de Agentes IA
-- PRD Seção 6 — Observabilidade e Auditoria
-- ============================================

-- 1. Execuções de Agentes (cada run de um StateGraph)
CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name TEXT NOT NULL CHECK (agent_name IN ('captador', 'operacional', 'comunicador', 'orquestrador')),
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('cron', 'webhook', 'manual', 'urgent', 'chain')),
  trigger_source TEXT,                         -- ex: "email-read-worker", "dou-cron", "api-manual"
  company_id UUID REFERENCES companies(id),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'timeout', 'cancelled')),
  input_data JSONB DEFAULT '{}'::jsonb,
  output_data JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  total_tokens_used INTEGER DEFAULT 0,
  total_cost_usd NUMERIC(10,6) DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0,
  cache_write_tokens INTEGER DEFAULT 0,
  steps_executed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_runs_agent ON agent_runs(agent_name);
CREATE INDEX idx_agent_runs_status ON agent_runs(status);
CREATE INDEX idx_agent_runs_company ON agent_runs(company_id);
CREATE INDEX idx_agent_runs_started ON agent_runs(started_at DESC);

-- 2. Decisões tomadas pelos agentes (audit trail IA)
CREATE TABLE IF NOT EXISTS agent_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  step_name TEXT NOT NULL,                    -- ex: "classificar", "extrair", "decidir_rota"
  decision_type TEXT NOT NULL CHECK (decision_type IN ('classification', 'extraction', 'routing', 'action', 'escalation', 'approval')),
  input_summary TEXT,                         -- resumo do que o agente recebeu
  output_summary TEXT,                        -- resumo do que decidiu
  confidence NUMERIC(4,3),                    -- 0.000 a 1.000
  model_used TEXT,                            -- ex: "claude-haiku-4-5-20251001"
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  latency_ms INTEGER,
  escalated_to_human BOOLEAN DEFAULT FALSE,
  human_override TEXT,                        -- se humano corrigiu, registra aqui
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_decisions_run ON agent_decisions(run_id);
CREATE INDEX idx_agent_decisions_agent ON agent_decisions(agent_name);
CREATE INDEX idx_agent_decisions_escalated ON agent_decisions(escalated_to_human) WHERE escalated_to_human = TRUE;

-- 3. Métricas agregadas (atualizada periodicamente)
CREATE TABLE IF NOT EXISTS agent_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  agent_name TEXT NOT NULL,
  total_runs INTEGER DEFAULT 0,
  successful_runs INTEGER DEFAULT 0,
  failed_runs INTEGER DEFAULT 0,
  avg_duration_ms INTEGER DEFAULT 0,
  p95_duration_ms INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  total_cost_usd NUMERIC(10,4) DEFAULT 0,
  cache_hit_rate NUMERIC(5,4) DEFAULT 0,       -- 0.0000 a 1.0000
  escalation_rate NUMERIC(5,4) DEFAULT 0,
  avg_confidence NUMERIC(4,3) DEFAULT 0,
  top_decision_types JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_metrics_period ON agent_metrics(period_start DESC);
CREATE INDEX idx_agent_metrics_agent ON agent_metrics(agent_name);

-- 4. Saúde do sistema (heartbeat dos workers + agentes)
CREATE TABLE IF NOT EXISTS system_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component TEXT NOT NULL,                     -- ex: "worker-dou", "agent-captador", "redis", "supabase"
  status TEXT NOT NULL DEFAULT 'healthy' CHECK (status IN ('healthy', 'degraded', 'unhealthy', 'offline')),
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  details JSONB DEFAULT '{}'::jsonb,           -- métricas específicas do componente
  error_count INTEGER DEFAULT 0,
  uptime_seconds INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_system_health_component ON system_health(component);

-- 5. View para dashboard de agentes
CREATE OR REPLACE VIEW vw_agent_dashboard AS
SELECT
  agent_name,
  COUNT(*) FILTER (WHERE started_at > NOW() - INTERVAL '24 hours') AS runs_24h,
  COUNT(*) FILTER (WHERE status = 'completed' AND started_at > NOW() - INTERVAL '24 hours') AS success_24h,
  COUNT(*) FILTER (WHERE status = 'failed' AND started_at > NOW() - INTERVAL '24 hours') AS failed_24h,
  ROUND(AVG(duration_ms) FILTER (WHERE started_at > NOW() - INTERVAL '24 hours'))::INTEGER AS avg_ms_24h,
  SUM(total_tokens_used) FILTER (WHERE started_at > NOW() - INTERVAL '24 hours') AS tokens_24h,
  SUM(total_cost_usd) FILTER (WHERE started_at > NOW() - INTERVAL '24 hours') AS cost_24h,
  ROUND(AVG(cache_read_tokens::NUMERIC / NULLIF(total_tokens_used, 0)) FILTER (WHERE started_at > NOW() - INTERVAL '24 hours'), 4) AS cache_hit_rate_24h
FROM agent_runs
GROUP BY agent_name;

-- 6. View para decisões que precisaram de escalonamento humano
CREATE OR REPLACE VIEW vw_agent_escalations AS
SELECT
  d.id,
  d.run_id,
  d.agent_name,
  d.step_name,
  d.input_summary,
  d.output_summary,
  d.confidence,
  d.human_override,
  d.created_at,
  r.company_id,
  r.trigger_type
FROM agent_decisions d
JOIN agent_runs r ON r.id = d.run_id
WHERE d.escalated_to_human = TRUE
ORDER BY d.created_at DESC;
