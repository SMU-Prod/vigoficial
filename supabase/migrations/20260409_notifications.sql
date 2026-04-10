-- ============================================
-- NOTIFICATIONS TABLE — Real-time notification system
-- Replaces hardcoded mock data in dashboard layout
-- ============================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'success', 'danger')),
  -- Link to related entity for click-through navigation
  category text NOT NULL DEFAULT 'system' CHECK (category IN (
    'email_sent', 'email_received', 'email_error',
    'workflow_created', 'workflow_completed', 'workflow_error',
    'compliance_alert', 'compliance_expiring',
    'dou_match', 'dou_alert_sent',
    'gesp_completed', 'gesp_error',
    'billing_paid', 'billing_overdue', 'billing_created',
    'prospect_new', 'prospect_converted', 'prospect_reply',
    'agent_completed', 'agent_error',
    'fleet_alert',
    'system'
  )),
  related_type text, -- 'email_outbound', 'workflow', 'company', 'prospect', 'agent_run', etc.
  related_id uuid,
  link text, -- Dashboard link to navigate on click (e.g. /empresas/uuid, /prospeccao)
  read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  read_at timestamp with time zone,
  CONSTRAINT notifications_pkey PRIMARY KEY (id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, read, created_at DESC)
  WHERE read = false;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_company
  ON public.notifications (company_id, created_at DESC);

-- RLS policies
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can only read their own notifications
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

-- Users can update (mark read) their own notifications
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- Service role can insert (system creates notifications)
CREATE POLICY notifications_insert_service ON public.notifications
  FOR INSERT WITH CHECK (true);

-- Users can delete their own notifications
CREATE POLICY notifications_delete_own ON public.notifications
  FOR DELETE USING (auth.uid() = user_id);

-- Auto-cleanup: delete notifications older than 90 days
-- (to be called by cron job)
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS integer AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.notifications
  WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
