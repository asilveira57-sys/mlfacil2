-- Tabela para rastrear jobs de sincronização em background
CREATE TABLE sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  job_type TEXT NOT NULL DEFAULT 'orders', -- 'orders', 'shipments', 'invoices'
  status TEXT NOT NULL DEFAULT 'processing', -- 'processing', 'done', 'error'
  total_records INTEGER DEFAULT 0,
  processed_records INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own jobs
CREATE POLICY "sync_jobs_select" ON sync_jobs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own jobs (for frontend tracking)
CREATE POLICY "sync_jobs_insert" ON sync_jobs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Index for fast lookup
CREATE INDEX idx_sync_jobs_seller_status ON sync_jobs(seller_id, status, created_at DESC);