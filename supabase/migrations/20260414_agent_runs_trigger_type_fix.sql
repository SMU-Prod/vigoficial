-- ──────────────────────────────────────────────────────────────────
-- Fix: agent_runs.trigger_type CHECK constraint outdated
--
-- O enum TypeScript (TriggerType) inclui 'full' e 'light' mas a
-- constraint original só aceitava cron|webhook|manual|urgent|chain.
-- Isso fazia /api/cron/light falhar com:
--   "new row for relation agent_runs violates check constraint
--    agent_runs_trigger_type_check"
--
-- Esta migração atualiza a constraint para aceitar todos os valores
-- suportados pelo código.
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE agent_runs
  DROP CONSTRAINT IF EXISTS agent_runs_trigger_type_check;

ALTER TABLE agent_runs
  ADD CONSTRAINT agent_runs_trigger_type_check
  CHECK (trigger_type = ANY (ARRAY[
    'cron'::text,
    'webhook'::text,
    'manual'::text,
    'urgent'::text,
    'chain'::text,
    'full'::text,
    'light'::text
  ]));
