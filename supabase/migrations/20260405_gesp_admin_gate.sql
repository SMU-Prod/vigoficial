-- =============================================================================
-- VIGI PRO — GESP Admin Authorization Gate
-- Migration: 20260405_gesp_admin_gate.sql
--
-- Creates the gesp_approvals table.
-- Every GESP action requested by an agent must have a corresponding approval
-- record. The admin reviews and approves/rejects before the agent executes.
--
-- POLICY: No GESP write action may proceed without status = 'approved'.
--
-- Schema notes:
--   - Users table: users.role IN ('admin','operador','viewer'), users.company_ids UUID[]
--   - No Supabase native auth (custom JWT) → auth.uid() not reliable, use service_role
--   - RLS: service_role bypass covers all agent + API access
-- =============================================================================

BEGIN TRANSACTION;

-- ─── Enums ───

DO $$ BEGIN
  CREATE TYPE gesp_approval_status AS ENUM ('pending', 'approved', 'rejected', 'expired');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE gesp_approval_urgency AS ENUM ('low', 'normal', 'high', 'critical');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── Main Table ───

CREATE TABLE IF NOT EXISTS gesp_approvals (
  -- Identity
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Process identification
  process_code    TEXT NOT NULL,  -- e.g. "comunicar_ocorrencia"
  process_name    TEXT NOT NULL,  -- e.g. "Comunicação de Ocorrência"

  -- Agent context
  agent_name      TEXT NOT NULL,  -- "captador" | "operacional" | "comunicador" | "orquestrador"
  agent_run_id    TEXT NOT NULL,  -- BullMQ job ID

  -- Data for admin review
  payload         JSONB NOT NULL DEFAULT '{}',

  -- Urgency & timing
  urgency         gesp_approval_urgency NOT NULL DEFAULT 'normal',
  status          gesp_approval_status NOT NULL DEFAULT 'pending',
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ,      -- auto-computed TTL by urgency

  -- Admin decision (decided_by links to internal users table, not auth.users)
  admin_notes     TEXT,
  decided_at      TIMESTAMPTZ,
  decided_by      UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Audit
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ───
-- Note: no partial index predicates on enum columns — PostgreSQL requires
-- IMMUTABLE functions in WHERE predicates, which enum casts don't always satisfy.
-- Regular composite indexes achieve equivalent query performance.

-- Dashboard: pending approvals sorted by urgency + time
CREATE INDEX IF NOT EXISTS gesp_approvals_company_status_idx
  ON gesp_approvals(company_id, status, urgency DESC, requested_at ASC);

-- Agent polling: find their specific approval by run id
CREATE INDEX IF NOT EXISTS gesp_approvals_agent_run_idx
  ON gesp_approvals(agent_run_id, status);

-- waitForApproval polling: status check by id
CREATE INDEX IF NOT EXISTS gesp_approvals_id_status_idx
  ON gesp_approvals(id, status);

-- History query: all decisions for a company ordered by time
CREATE INDEX IF NOT EXISTS gesp_approvals_company_history_idx
  ON gesp_approvals(company_id, requested_at DESC);

-- ─── Updated_at Trigger ───

CREATE OR REPLACE FUNCTION update_gesp_approvals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gesp_approvals_updated_at_trigger ON gesp_approvals;
CREATE TRIGGER gesp_approvals_updated_at_trigger
  BEFORE UPDATE ON gesp_approvals
  FOR EACH ROW
  EXECUTE FUNCTION update_gesp_approvals_updated_at();

-- ─── Auto-expire: mark expired approvals via scheduled function ───
-- The admin-gate.ts checks expiry on read; this DB function is a safety net.
-- Call periodically: SELECT expire_gesp_approvals();

CREATE OR REPLACE FUNCTION expire_gesp_approvals()
RETURNS void AS $$
BEGIN
  UPDATE gesp_approvals
  SET status = 'expired', updated_at = NOW()
  WHERE status = 'pending'::gesp_approval_status
    AND expires_at IS NOT NULL
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ─── Row Level Security ───

ALTER TABLE gesp_approvals ENABLE ROW LEVEL SECURITY;

-- Service role bypass — covers ALL agent and API access.
-- The admin dashboard API routes use service_role key, so this is the
-- primary access path. No need for per-user policies since auth is custom JWT.
CREATE POLICY "gesp_approvals_service_role_all"
  ON gesp_approvals
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Admin users via custom users table (role = 'admin' AND company in company_ids)
-- This policy allows SELECT for admins who have authenticated via the custom system.
-- Note: This uses the users table directly since we use custom JWT auth, not Supabase auth.
-- In practice, all admin access goes through the API route (service_role), so this
-- policy is a defense-in-depth measure only.
CREATE POLICY "gesp_approvals_admin_select"
  ON gesp_approvals
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.role = 'admin'
        AND gesp_approvals.company_id = ANY(u.company_ids)
        AND u.email = current_user
    )
  );

-- ─── Comments ───

COMMENT ON TABLE gesp_approvals IS
  'Admin authorization gate for all GESP agent actions. '
  'Every write operation in GESP must have a corresponding approved record. '
  'Agents poll this table via waitForApproval() before executing.';

COMMENT ON COLUMN gesp_approvals.process_code IS
  'GESP process code from knowledge-base.ts (e.g., "comunicar_ocorrencia")';

COMMENT ON COLUMN gesp_approvals.payload IS
  'Full data the agent will use when executing — admin reviews this before approving';

COMMENT ON COLUMN gesp_approvals.urgency IS
  'critical: 24h deadline processes | high: 8h TTL | normal: 24h TTL | low: 72h TTL';

COMMENT ON COLUMN gesp_approvals.expires_at IS
  'Auto-computed from urgency. Pending approvals past this timestamp are auto-expired.';

COMMIT;
