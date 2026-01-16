-- Create backfill sync state table for tracking progress
CREATE TABLE public.meli_backfill_sync_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  cursor_offset INTEGER DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  processed_orders INTEGER DEFAULT 0,
  with_billing INTEGER DEFAULT 0,
  last_heartbeat_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(seller_id)
);

-- Enable RLS
ALTER TABLE public.meli_backfill_sync_state ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own backfill state"
ON public.meli_backfill_sync_state
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own backfill state"
ON public.meli_backfill_sync_state
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own backfill state"
ON public.meli_backfill_sync_state
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own backfill state"
ON public.meli_backfill_sync_state
FOR DELETE
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_meli_backfill_sync_state_updated_at
BEFORE UPDATE ON public.meli_backfill_sync_state
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();