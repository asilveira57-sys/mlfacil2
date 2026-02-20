
-- =============================================
-- UPGRADE shipping_cutoff_logs with V2 columns
-- =============================================
ALTER TABLE public.shipping_cutoff_logs
  ADD COLUMN IF NOT EXISTS trace_id TEXT,
  ADD COLUMN IF NOT EXISTS step TEXT NOT NULL DEFAULT 'main',
  ADD COLUMN IF NOT EXISTS http_status INTEGER NULL,
  ADD COLUMN IF NOT EXISTS endpoint_name TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_cutoff_logs_trace_id ON public.shipping_cutoff_logs (trace_id);

-- =============================================
-- SHIPPING CUTOFF LOCKS (concurrency control)
-- =============================================
CREATE TABLE public.shipping_cutoff_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  seller_id UUID NOT NULL,
  date_ref DATE NOT NULL,
  lock_key TEXT NOT NULL,
  locked_by_user_id UUID NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'locked',
  CONSTRAINT uq_cutoff_lock_key UNIQUE (lock_key)
);

CREATE INDEX idx_cutoff_locks_expires ON public.shipping_cutoff_locks (expires_at);

ALTER TABLE public.shipping_cutoff_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access cutoff locks"
  ON public.shipping_cutoff_locks FOR ALL
  USING (auth.role() = 'service_role');

-- =============================================
-- SHIPPING CUTOFF MANUAL RATE LIMIT
-- =============================================
CREATE TABLE public.shipping_cutoff_manual_rate_limit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  seller_id UUID NOT NULL,
  last_manual_refresh_at TIMESTAMPTZ NOT NULL,
  cooldown_minutes INTEGER NOT NULL DEFAULT 15,
  CONSTRAINT uq_cutoff_rate_limit UNIQUE (company_id, seller_id)
);

ALTER TABLE public.shipping_cutoff_manual_rate_limit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access cutoff rate limit"
  ON public.shipping_cutoff_manual_rate_limit FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own rate limit"
  ON public.shipping_cutoff_manual_rate_limit FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = shipping_cutoff_manual_rate_limit.company_id
        AND c.user_id = auth.uid()
    )
  );
