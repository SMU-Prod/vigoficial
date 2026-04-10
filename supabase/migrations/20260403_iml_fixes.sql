-- =============================================================================
-- VIGI PRO — IML Fixes: CASCADE→RESTRICT, Compound Indexes, Performance
-- =============================================================================

-- ─── 1. CASCADE → RESTRICT nos edges ────────────────────────────────────────
-- Impede deleção acidental de eventos que tenham relações causais.
-- Se precisar deletar um evento, primeiro remova suas edges.

ALTER TABLE iml_event_edges
  DROP CONSTRAINT IF EXISTS iml_event_edges_source_event_id_fkey,
  DROP CONSTRAINT IF EXISTS iml_event_edges_target_event_id_fkey;

ALTER TABLE iml_event_edges
  ADD CONSTRAINT iml_event_edges_source_event_id_fkey
    FOREIGN KEY (source_event_id) REFERENCES iml_events(id) ON DELETE RESTRICT,
  ADD CONSTRAINT iml_event_edges_target_event_id_fkey
    FOREIGN KEY (target_event_id) REFERENCES iml_events(id) ON DELETE RESTRICT;

-- ─── 2. Compound indexes para CTE traversal e queries frequentes ────────────

-- Edge traversal: source + relation (usado em getEventChain recursive CTE)
CREATE INDEX IF NOT EXISTS idx_iml_edges_source_relation
  ON iml_event_edges(source_event_id, relation_type);

-- Edge traversal: target + relation (para busca reversa)
CREATE INDEX IF NOT EXISTS idx_iml_edges_target_relation
  ON iml_event_edges(target_event_id, relation_type);

-- Events: agent + occurred_at (query mais comum: eventos recentes por agente)
CREATE INDEX IF NOT EXISTS idx_iml_events_agent_occurred
  ON iml_events(agent_name, occurred_at DESC);

-- Events: company + occurred_at (histórico por empresa)
CREATE INDEX IF NOT EXISTS idx_iml_events_company_occurred
  ON iml_events(company_id, occurred_at DESC);

-- Events: type + company (padrões por empresa e tipo)
CREATE INDEX IF NOT EXISTS idx_iml_events_type_company
  ON iml_events(event_type, company_id);

-- Insights: status + confidence (filtro do admin panel)
CREATE INDEX IF NOT EXISTS idx_iml_insights_status_confidence
  ON iml_insights(status, confidence DESC)
  WHERE status IN ('pending', 'ready');

-- Playbook: rule_code + active (query do agent decorator)
CREATE INDEX IF NOT EXISTS idx_iml_playbook_rule_active
  ON iml_playbook_rules(rule_code, active)
  WHERE active = TRUE;

-- Playbook log: applied_at para cleanup e relatórios
CREATE INDEX IF NOT EXISTS idx_iml_playbook_log_applied
  ON iml_playbook_log(applied_at DESC);
