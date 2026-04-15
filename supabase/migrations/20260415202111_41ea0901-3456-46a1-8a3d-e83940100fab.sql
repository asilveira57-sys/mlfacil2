
-- V2 print queue table with enhanced tracking
CREATE TABLE public.meli_print_queue_v2 (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT 'v2',
  format TEXT NOT NULL CHECK (format IN ('pdf', 'zpl')),
  layout TEXT NOT NULL DEFAULT 'meli_100x150',
  shipment_ids TEXT[] NOT NULL DEFAULT '{}',
  total_labels INTEGER NOT NULL DEFAULT 0,
  processed_labels INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'processando', 'concluido', 'parcial', 'erro')),
  batches JSONB NOT NULL DEFAULT '[]',
  per_shipment_log JSONB DEFAULT NULL,
  page_width_mm NUMERIC DEFAULT NULL,
  page_height_mm NUMERIC DEFAULT NULL,
  page_width_pt NUMERIC DEFAULT NULL,
  page_height_pt NUMERIC DEFAULT NULL,
  total_pages INTEGER DEFAULT NULL,
  file_url TEXT DEFAULT NULL,
  zpl_content TEXT DEFAULT NULL,
  error_log TEXT DEFAULT NULL,
  download_filename TEXT DEFAULT NULL,
  job_started_at TIMESTAMPTZ DEFAULT NULL,
  job_completed_at TIMESTAMPTZ DEFAULT NULL,
  duration_ms INTEGER DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_meli_print_queue_v2_seller ON public.meli_print_queue_v2 (seller_id, created_at DESC);
CREATE INDEX idx_meli_print_queue_v2_user ON public.meli_print_queue_v2 (user_id, created_at DESC);
CREATE INDEX idx_meli_print_queue_v2_status ON public.meli_print_queue_v2 (status) WHERE status IN ('pendente', 'processando');

-- RLS
ALTER TABLE public.meli_print_queue_v2 ENABLE ROW LEVEL SECURITY;

-- Users can read their own jobs
CREATE POLICY "Users can view their own V2 print jobs"
  ON public.meli_print_queue_v2
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own jobs
CREATE POLICY "Users can create their own V2 print jobs"
  ON public.meli_print_queue_v2
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Service role handles updates (edge function)
-- No UPDATE/DELETE policy for authenticated users

-- Timestamp trigger
CREATE TRIGGER update_meli_print_queue_v2_updated_at
  BEFORE UPDATE ON public.meli_print_queue_v2
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
