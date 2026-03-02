
-- Table to track bulk reimport job progress
CREATE TABLE public.cost_bulk_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  job_type TEXT NOT NULL DEFAULT 'reimport',
  status TEXT NOT NULL DEFAULT 'pending',
  order_ids TEXT[] NOT NULL DEFAULT '{}',
  total_orders INTEGER NOT NULL DEFAULT 0,
  processed_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  current_offset INTEGER NOT NULL DEFAULT 0,
  chunk_size INTEGER NOT NULL DEFAULT 10,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cost_bulk_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own bulk jobs"
  ON public.cost_bulk_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own bulk jobs"
  ON public.cost_bulk_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bulk jobs"
  ON public.cost_bulk_jobs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_cost_bulk_jobs_updated_at
  BEFORE UPDATE ON public.cost_bulk_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
