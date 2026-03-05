
-- Phase 4: Abuse protection logging
-- Extend tenant_limit_log to cover auth events and add system_audit_log for broader tracking

CREATE TABLE IF NOT EXISTS public.system_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  event_type text NOT NULL, -- 'auth_signup', 'auth_login', 'ml_connect_attempt', 'ml_connect_success', 'ml_disconnect', 'sales_check', 'upgrade_attempt', 'block_triggered'
  event_category text DEFAULT 'system', -- 'auth', 'connection', 'billing', 'sync', 'system'
  target_id text, -- e.g. seller_id, account_id
  ip_address text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.system_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can read audit logs
CREATE POLICY "Admins can view audit logs"
  ON public.system_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- System (service role) can insert
CREATE POLICY "Service can insert audit logs"
  ON public.system_audit_log FOR INSERT TO authenticated
  WITH CHECK (true);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_system_audit_log_user ON public.system_audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_audit_log_event ON public.system_audit_log(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_limit_log_company ON public.tenant_limit_log(company_id, created_at DESC);
