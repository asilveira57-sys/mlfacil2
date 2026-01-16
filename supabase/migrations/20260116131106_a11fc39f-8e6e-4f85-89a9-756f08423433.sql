-- Create updated_at function if not exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create billing details sync state table for resumable historical sync
CREATE TABLE IF NOT EXISTS public.meli_billing_details_sync_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  scope TEXT DEFAULT 'recent',
  periods_offset INTEGER DEFAULT 0,
  period_key_cursor TEXT,
  details_offset INTEGER DEFAULT 0,
  total_periods INTEGER DEFAULT 0,
  processed_periods INTEGER DEFAULT 0,
  total_details INTEGER DEFAULT 0,
  processed_details INTEGER DEFAULT 0,
  last_error TEXT,
  last_heartbeat_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(seller_id, user_id)
);

-- Enable RLS
ALTER TABLE public.meli_billing_details_sync_state ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own billing sync state"
  ON public.meli_billing_details_sync_state FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own billing sync state"
  ON public.meli_billing_details_sync_state FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own billing sync state"
  ON public.meli_billing_details_sync_state FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own billing sync state"
  ON public.meli_billing_details_sync_state FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_meli_billing_details_sync_state_updated_at
  BEFORE UPDATE ON public.meli_billing_details_sync_state
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();