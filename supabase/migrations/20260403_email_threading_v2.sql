-- =============================================================================
-- VIGI SQL MIGRATION 20260403 — EMAIL THREADING V2
-- Email threading system, user metrics, knowledge base, and webhook idempotency
-- =============================================================================

-- =============================================================================
-- 1. EMAIL_THREADS
-- Principal table for email conversation threading
-- =============================================================================
CREATE TABLE IF NOT EXISTS email_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  subject text NOT NULL,
  cnpj_detectado text,
  status text NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'EM_ANDAMENTO', 'FINALIZADO')),
  tipo_demanda text,
  last_message_id text,
  message_ids text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finalizado_at timestamptz,
  finalizado_por uuid REFERENCES users(id)
);

CREATE INDEX idx_email_threads_company ON email_threads(company_id);
CREATE INDEX idx_email_threads_status ON email_threads(status);
CREATE INDEX idx_email_threads_cnpj ON email_threads(cnpj_detectado);
CREATE INDEX idx_email_threads_created ON email_threads(created_at DESC);
CREATE INDEX idx_email_threads_updated ON email_threads(updated_at DESC);

-- =============================================================================
-- 2. THREAD_PARTICIPANTS
-- Tracks all participants in an email thread (internal admins, operators, external)
-- =============================================================================
CREATE TABLE IF NOT EXISTS thread_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id),
  email text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('interno_admin', 'interno_operador', 'externo_cnpj', 'externo_outro')),
  motivo_entrada text NOT NULL CHECK (motivo_entrada IN ('responsavel_empresa', 'interveio', 'cliente_copiou', 'admin_manual')),
  entrou_em timestamptz NOT NULL DEFAULT now(),
  ativo boolean NOT NULL DEFAULT true,
  UNIQUE(thread_id, email)
);

CREATE INDEX idx_thread_participants_thread ON thread_participants(thread_id);
CREATE INDEX idx_thread_participants_email ON thread_participants(email);
CREATE INDEX idx_thread_participants_ativo ON thread_participants(ativo);

-- =============================================================================
-- 3. USER_METRICS
-- Performance metrics for users handling threads and tasks
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  thread_id uuid REFERENCES email_threads(id),
  company_id uuid REFERENCES companies(id),
  t_primeira_leitura timestamptz,
  t_acao_iniciada timestamptz,
  t_cliente_atualizado timestamptz,
  minutos_resposta int,
  minutos_execucao int,
  dentro_do_prazo boolean,
  modulo_gesp text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_metrics_user ON user_metrics(user_id);
CREATE INDEX idx_user_metrics_company ON user_metrics(company_id);
CREATE INDEX idx_user_metrics_created ON user_metrics(created_at DESC);

-- =============================================================================
-- 4. KNOWLEDGE_BASE
-- Knowledge base for case solutions and AI confidence tracking
-- =============================================================================
CREATE TABLE IF NOT EXISTS knowledge_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_original_id uuid REFERENCES email_inbound(id),
  descricao_caso text NOT NULL,
  solucao_adotada text,
  resolvido_por_id uuid REFERENCES users(id),
  tempo_resolucao_min int,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'rejeitado', 'auto_aprovado')),
  confianca_ia decimal(3,2) DEFAULT 0.00,
  aprovado_por_email boolean DEFAULT false,
  tags text[] DEFAULT '{}',
  kb_ref text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_knowledge_base_status ON knowledge_base(status);
CREATE INDEX idx_knowledge_base_kb_ref ON knowledge_base(kb_ref);
CREATE INDEX idx_knowledge_base_created ON knowledge_base(created_at DESC);

-- =============================================================================
-- 5. WEBHOOK_PROCESSED
-- Idempotency table for webhook processing (prevents duplicate handling)
-- =============================================================================
CREATE TABLE IF NOT EXISTS webhook_processed (
  svix_id text PRIMARY KEY,
  endpoint text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_processed_at ON webhook_processed(processed_at DESC);

-- =============================================================================
-- 6. ALTER EMAIL_OUTBOUND
-- Add threading and tracking columns
-- =============================================================================
ALTER TABLE email_outbound ADD COLUMN IF NOT EXISTS thread_id uuid REFERENCES email_threads(id);
ALTER TABLE email_outbound ADD COLUMN IF NOT EXISTS cc_emails text[] DEFAULT '{}';
ALTER TABLE email_outbound ADD COLUMN IF NOT EXISTS opened_at timestamptz;
ALTER TABLE email_outbound ADD COLUMN IF NOT EXISTS clicked_at timestamptz;

-- =============================================================================
-- 7. ALTER EMAIL_INBOUND
-- Add thread_id for inbound email threading
-- =============================================================================
ALTER TABLE email_inbound ADD COLUMN IF NOT EXISTS thread_id uuid REFERENCES email_threads(id);

-- =============================================================================
-- 8. ENABLE ROW LEVEL SECURITY
-- RLS policies for data isolation by company
-- =============================================================================
ALTER TABLE email_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE thread_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_processed ENABLE ROW LEVEL SECURITY;

-- Policy: Block all access via anon role (security default)
-- Backend uses service_role which bypasses RLS
CREATE POLICY "Deny all for anon" ON email_threads FOR ALL TO anon USING (false);
CREATE POLICY "Deny all for anon" ON thread_participants FOR ALL TO anon USING (false);
CREATE POLICY "Deny all for anon" ON user_metrics FOR ALL TO anon USING (false);
CREATE POLICY "Deny all for anon" ON knowledge_base FOR ALL TO anon USING (false);
CREATE POLICY "Deny all for anon" ON webhook_processed FOR ALL TO anon USING (false);

-- Service role bypass RLS (allow all operations)
CREATE POLICY "Service role bypass" ON email_threads FOR ALL TO service_role USING (true);
CREATE POLICY "Service role bypass" ON thread_participants FOR ALL TO service_role USING (true);
CREATE POLICY "Service role bypass" ON user_metrics FOR ALL TO service_role USING (true);
CREATE POLICY "Service role bypass" ON knowledge_base FOR ALL TO service_role USING (true);
CREATE POLICY "Service role bypass" ON webhook_processed FOR ALL TO service_role USING (true);

-- Admin access: can view all threads for their assigned companies
CREATE POLICY "Admin view threads" ON email_threads FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role = 'admin'
    )
  );

-- Operador access: can view threads for their assigned companies
CREATE POLICY "Operador view threads" ON email_threads FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role = 'operador'
        AND company_id = ANY(u.company_ids)
    )
  );

-- Admin can modify threads
CREATE POLICY "Admin modify threads" ON email_threads FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role = 'admin'
    )
  );

-- Admin can insert threads
CREATE POLICY "Admin insert threads" ON email_threads FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role = 'admin'
    )
  );

-- =============================================================================
-- 9. TRIGGER FOR UPDATED_AT
-- Automatically updates updated_at timestamp when email_threads is modified
-- =============================================================================
CREATE TRIGGER trg_email_threads_updated_at BEFORE UPDATE ON email_threads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- 10. AUDIT LOG IMMUTABILITY TRIGGER
-- Prevents UPDATE and DELETE on audit_log table (write-once audit trail)
-- =============================================================================
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is immutable: UPDATE and DELETE are not allowed';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_immutable ON audit_log;
CREATE TRIGGER audit_log_immutable
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_modification();

-- =============================================================================
-- END OF MIGRATION 20260403
-- =============================================================================
