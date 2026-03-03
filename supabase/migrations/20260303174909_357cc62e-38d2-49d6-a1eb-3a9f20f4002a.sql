
CREATE TABLE public.orders_historical_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  job_type TEXT NOT NULL DEFAULT 'historical_365d',
  status TEXT NOT NULL DEFAULT 'pending',
  days_back INTEGER NOT NULL DEFAULT 365,
  total_orders INTEGER DEFAULT 0,
  processed_orders INTEGER DEFAULT 0,
  current_offset INTEGER DEFAULT 0,
  error_message TEXT,
  scheduled_for TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.orders_historical_sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own jobs"
  ON public.orders_historical_sync_jobs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service role full access"
  ON public.orders_historical_sync_jobs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_orders_historical_sync_jobs_seller_status 
  ON public.orders_historical_sync_jobs (seller_id, status);
