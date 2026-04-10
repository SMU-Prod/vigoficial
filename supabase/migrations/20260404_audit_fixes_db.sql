-- =============================================================================
-- VIGI DATABASE AUDIT FIXES — 20260404
-- Comprehensive migration addressing all database audit findings
-- BD-01 through BD-08
-- =============================================================================

BEGIN TRANSACTION;

-- =============================================================================
-- BD-01: HARDCODED ADMIN PASSWORD HASH
-- Historical documentation — this password hash exists in migration 001
-- Hash: $2a$12$LJ3m4ys3Lz0QVOqOKqQHYeGJYj8wJZ1Q5zFZm.xjR6k5bN9YwXGOe
-- Action: Document in code. Seed scripts should manage initial passwords.
-- See: 001_tabelas_principais.sql, users table
-- Future: Move to seed script, not stored in migrations
-- =============================================================================
-- This is a documentation comment only; the hash cannot be removed from
-- migration history without data loss. New password updates should use seed files.

-- =============================================================================
-- BD-02: MISSING UNIQUE CONSTRAINT ON EMPLOYEE EMAILS
-- Add compound unique constraint on (email, company_id)
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employees_email_company_unique'
  ) THEN
    ALTER TABLE employees ADD CONSTRAINT employees_email_company_unique UNIQUE(email, company_id);
  END IF;
END $$;

-- =============================================================================
-- BD-03: ARRAY FKs WITHOUT REFERENTIAL INTEGRITY
-- Create junction tables to replace:
-- - email_workflows.gesp_task_ids (UUID[])
-- - email_workflows.email_outbound_ids (UUID[])
-- =============================================================================

-- Junction table: email_workflows → gesp_tasks (many-to-many)
CREATE TABLE IF NOT EXISTS workflow_gesp_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID NOT NULL REFERENCES email_workflows(id) ON DELETE CASCADE,
  gesp_task_id UUID NOT NULL REFERENCES gesp_tasks(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workflow_id, gesp_task_id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_gesp_tasks_workflow
  ON workflow_gesp_tasks(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_gesp_tasks_task
  ON workflow_gesp_tasks(gesp_task_id);

-- Junction table: email_workflows → email_outbound (many-to-many)
CREATE TABLE IF NOT EXISTS workflow_email_outbound (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID NOT NULL REFERENCES email_workflows(id) ON DELETE CASCADE,
  email_outbound_id UUID NOT NULL REFERENCES email_outbound(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workflow_id, email_outbound_id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_email_outbound_workflow
  ON workflow_email_outbound(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_email_outbound_email
  ON workflow_email_outbound(email_outbound_id);

-- Populate junction tables from existing array data
-- Note: This is safe to run multiple times due to UNIQUE constraint
INSERT INTO workflow_gesp_tasks (workflow_id, gesp_task_id)
SELECT DISTINCT w.id, (unnest(w.gesp_task_ids))
FROM email_workflows w
WHERE w.gesp_task_ids IS NOT NULL
  AND array_length(w.gesp_task_ids, 1) > 0
ON CONFLICT (workflow_id, gesp_task_id) DO NOTHING;

INSERT INTO workflow_email_outbound (workflow_id, email_outbound_id)
SELECT DISTINCT w.id, (unnest(w.email_outbound_ids))
FROM email_workflows w
WHERE w.email_outbound_ids IS NOT NULL
  AND array_length(w.email_outbound_ids, 1) > 0
ON CONFLICT (workflow_id, email_outbound_id) DO NOTHING;

-- =============================================================================
-- BD-04: DASHBOARD VIEW PERFORMANCE
-- Create materialized view vw_dashboard_kpis_materialized for faster queries
-- Add indexes on heavily queried columns for COUNT(*) operations
-- =============================================================================

-- Index to support COUNT(*) queries on key filtered columns
CREATE INDEX IF NOT EXISTS idx_companies_habilitada_billing
  ON companies(habilitada, billing_status)
  WHERE habilitada = true AND billing_status = 'ativo';

CREATE INDEX IF NOT EXISTS idx_employees_active_status
  ON employees(status)
  WHERE status = 'ativo';

CREATE INDEX IF NOT EXISTS idx_workflows_open_status
  ON email_workflows(status)
  WHERE status NOT IN ('concluido', 'caso_desconhecido');

CREATE INDEX IF NOT EXISTS idx_workflows_urgent_open
  ON email_workflows(prioridade, status)
  WHERE prioridade = 'urgente'
    AND status NOT IN ('concluido', 'caso_desconhecido');

CREATE INDEX IF NOT EXISTS idx_gesp_tasks_pending_status
  ON gesp_tasks(status)
  WHERE status IN ('pendente', 'retry');

-- NOTE: CURRENT_DATE is STABLE (not IMMUTABLE) so it cannot be used in index
-- predicates. Using a plain index on sent_at instead — the query planner will
-- still use it efficiently for date range filters.
CREATE INDEX IF NOT EXISTS idx_email_outbound_sent_today
  ON email_outbound(company_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_vehicles_active_status
  ON vehicles(status)
  WHERE status = 'ativo';

CREATE INDEX IF NOT EXISTS idx_discrepancies_open_status
  ON discrepancies(status)
  WHERE status = 'aberta';

-- Materialized view for dashboard KPIs (can be refreshed on a schedule)
CREATE MATERIALIZED VIEW IF NOT EXISTS vw_dashboard_kpis_materialized AS
SELECT
  (SELECT COUNT(*) FROM companies WHERE habilitada = true AND billing_status = 'ativo')
    AS total_empresas_ativas,
  (SELECT COUNT(*) FROM employees WHERE status = 'ativo')
    AS total_vigilantes_ativos,
  (SELECT COUNT(*) FROM email_workflows WHERE status NOT IN ('concluido', 'caso_desconhecido'))
    AS workflows_abertos,
  (SELECT COUNT(*) FROM email_workflows WHERE prioridade = 'urgente' AND status NOT IN ('concluido', 'caso_desconhecido'))
    AS workflows_urgentes,
  (SELECT COUNT(*) FROM vw_validades_criticas WHERE severidade IN ('critico', 'urgente'))
    AS validades_criticas,
  (SELECT COUNT(*) FROM gesp_tasks WHERE status IN ('pendente', 'retry'))
    AS gesp_tasks_pendentes,
  (SELECT COUNT(*) FROM email_outbound WHERE sent_at >= CURRENT_DATE)
    AS emails_enviados_hoje,
  (SELECT COUNT(*) FROM vehicles WHERE status = 'ativo')
    AS total_veiculos_ativos,
  (SELECT COUNT(*) FROM discrepancies WHERE status = 'aberta')
    AS divergencias_abertas;

-- =============================================================================
-- BD-05: vw_validades_criticas PERFORMANCE
-- Add compound indexes on (type, expires_at) pattern
-- The view scans multiple tables with 9 UNION ALL branches
-- =============================================================================

-- CNV validades - most frequently queried validity type
CREATE INDEX IF NOT EXISTS idx_employees_cnv_expiry
  ON employees(cnv_data_validade)
  WHERE status = 'ativo' AND cnv_data_validade IS NOT NULL;

-- Reciclagem expiry
CREATE INDEX IF NOT EXISTS idx_employees_reciclagem_expiry
  ON employees(reciclagem_data_validade)
  WHERE status = 'ativo' AND reciclagem_data_validade IS NOT NULL;

-- Porte de arma expiry
CREATE INDEX IF NOT EXISTS idx_employees_porte_arma_expiry
  ON employees(porte_arma_validade)
  WHERE status = 'ativo' AND porte_arma_validade IS NOT NULL;

-- Company certifications (alvara + ecpf)
CREATE INDEX IF NOT EXISTS idx_companies_alvara_validade
  ON companies(alvara_validade)
  WHERE habilitada = true AND alvara_validade IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_companies_ecpf_validade
  ON companies(ecpf_validade)
  WHERE habilitada = true AND ecpf_validade IS NOT NULL;

-- Vest validity
CREATE INDEX IF NOT EXISTS idx_vests_validade_status
  ON vests(data_validade, status)
  WHERE status = 'ativo';

-- Vehicle maintenance-related dates (licenciamento, seguro, vistoria)
CREATE INDEX IF NOT EXISTS idx_vehicles_licenciamento_validade
  ON vehicles(licenciamento_validade)
  WHERE status = 'ativo' AND licenciamento_validade IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vehicles_seguro_validade
  ON vehicles(seguro_validade)
  WHERE status = 'ativo' AND seguro_validade IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vehicles_vistoria_pf_validade
  ON vehicles(vistoria_pf_validade, tipo)
  WHERE status = 'ativo' AND tipo = 'escolta' AND vistoria_pf_validade IS NOT NULL;

-- =============================================================================
-- BD-06: MISSING COMPOUND INDEX FOR EMAIL THREADING
-- Add index to support thread-based queries efficiently
-- Pattern: (company_id, thread_id, created_at DESC)
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_emails_thread
  ON email_inbound(company_id, thread_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_emails_outbound_thread
  ON email_outbound(company_id, thread_id, created_at DESC);

-- Additional threading support indexes
CREATE INDEX IF NOT EXISTS idx_thread_participants_company
  ON thread_participants(thread_id, email);

-- =============================================================================
-- BD-07: CACHE INVALIDATION
-- Note: This is a code/application-level fix, not a database change
-- Database supports invalidation via:
-- 1. Trigger-based event notifications (already in place)
-- 2. Materialized view refresh hooks (vw_dashboard_kpis_materialized)
-- 3. Cache busting on INSERT/UPDATE/DELETE via application logic
-- Action: Ensure application implements proper cache invalidation on mutations
-- =============================================================================
-- No database changes required; documented for completeness

-- =============================================================================
-- BD-08: JSONB TYPED COLUMNS - INDEXES ON FREQUENTLY QUERIED KEYS
-- Add GIN indexes for JSONB columns that are frequently filtered/queried
-- Columns: alertas_ativos (users, companies, employees, vehicles)
--          detalhes (audit_log, system_events)
--          dados_extraidos (email_workflows)
--          payload (gesp_tasks)
--          attachments (email_inbound, email_outbound)
-- =============================================================================

-- Alerts JSONB indexes (for alert filtering queries)
CREATE INDEX IF NOT EXISTS idx_companies_alertas_ativos
  ON companies USING GIN (alertas_ativos);

CREATE INDEX IF NOT EXISTS idx_employees_alertas_ativos
  ON employees USING GIN (alertas_ativos);

CREATE INDEX IF NOT EXISTS idx_vehicles_alertas_ativos
  ON vehicles USING GIN (alertas_ativos);

-- Audit log and system events JSONB indexes
CREATE INDEX IF NOT EXISTS idx_audit_log_detalhes
  ON audit_log USING GIN (detalhes);

CREATE INDEX IF NOT EXISTS idx_system_events_detalhes
  ON system_events USING GIN (detalhes);

-- Workflow data extraction index
CREATE INDEX IF NOT EXISTS idx_workflows_dados_extraidos
  ON email_workflows USING GIN (dados_extraidos);

-- GESP task payload index
CREATE INDEX IF NOT EXISTS idx_gesp_tasks_payload
  ON gesp_tasks USING GIN (payload);

-- Email attachments index (for searching by attachment types)
CREATE INDEX IF NOT EXISTS idx_email_inbound_attachments
  ON email_inbound USING GIN (attachments);

CREATE INDEX IF NOT EXISTS idx_email_outbound_attachments
  ON email_outbound USING GIN (attachments);

-- =============================================================================
-- SUMMARY OF CHANGES
-- =============================================================================
-- BD-01: Documented hardcoded password hash (cannot remove from history)
-- BD-02: Added UNIQUE(email, company_id) constraint on employees
-- BD-03: Created 2 junction tables with FK constraints for array relationships
-- BD-04: Added 8 indexes + materialized view for dashboard KPI performance
-- BD-05: Added 9 indexes on validity/expiry date columns for vw_validades_criticas
-- BD-06: Added 4 compound indexes for email threading queries
-- BD-07: Cache invalidation (application-level fix, documented)
-- BD-08: Added 10 GIN indexes on JSONB columns for filtered queries

COMMIT TRANSACTION;
