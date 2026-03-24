
-- Processing Queue table
CREATE TABLE public.processing_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  seller_id text NOT NULL,
  job_type text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  priority text NOT NULL DEFAULT 'normal',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  locked_by text,
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,
  error_message text,
  result_summary jsonb
);

-- Indexes for efficient batch pickup
CREATE INDEX idx_pq_status_priority ON public.processing_queue (status, priority, created_at);
CREATE INDEX idx_pq_seller ON public.processing_queue (seller_id);
CREATE INDEX idx_pq_tenant ON public.processing_queue (tenant_id);
CREATE INDEX idx_pq_job_type ON public.processing_queue (job_type, status);

-- Enable RLS
ALTER TABLE public.processing_queue ENABLE ROW LEVEL SECURITY;

-- Service role full access (workers)
CREATE POLICY "service_role_full_access" ON public.processing_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users can see their own jobs
CREATE POLICY "users_read_own_jobs" ON public.processing_queue
  FOR SELECT TO authenticated
  USING (
    seller_id IN (
      SELECT seller_id::text FROM public.ml_accounts WHERE user_id = auth.uid()
    )
  );

-- Authenticated users can insert their own jobs  
CREATE POLICY "users_insert_own_jobs" ON public.processing_queue
  FOR INSERT TO authenticated
  WITH CHECK (
    seller_id IN (
      SELECT seller_id::text FROM public.ml_accounts WHERE user_id = auth.uid()
    )
  );

-- Queue execution log
CREATE TABLE public.queue_execution_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id text NOT NULL,
  jobs_picked integer NOT NULL DEFAULT 0,
  jobs_completed integer NOT NULL DEFAULT 0,
  jobs_failed integer NOT NULL DEFAULT 0,
  sellers_processed integer NOT NULL DEFAULT 0,
  total_duration_ms integer,
  blocked_attempts integer NOT NULL DEFAULT 0,
  worker_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.queue_execution_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_log" ON public.queue_execution_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "admin_read_log" ON public.queue_execution_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
