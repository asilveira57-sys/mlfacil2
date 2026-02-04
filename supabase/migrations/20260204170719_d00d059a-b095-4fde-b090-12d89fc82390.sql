-- Create sync state table for resumable message synchronization (Phase B)
CREATE TABLE IF NOT EXISTS public.post_sale_messages_sync_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'paused', 'done', 'error')),
  cursor_created_at_meli TIMESTAMPTZ,
  cursor_order_id TEXT,
  processed_orders INTEGER DEFAULT 0,
  synced_conversations INTEGER DEFAULT 0,
  last_heartbeat_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error_code TEXT,
  last_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, seller_id)
);

-- Enable RLS
ALTER TABLE public.post_sale_messages_sync_state ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own sync state"
  ON public.post_sale_messages_sync_state
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sync state"
  ON public.post_sale_messages_sync_state
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sync state"
  ON public.post_sale_messages_sync_state
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Create index for fast lookup
CREATE INDEX IF NOT EXISTS idx_post_sale_messages_sync_state_user_seller 
  ON public.post_sale_messages_sync_state(user_id, seller_id);

-- Add trigger for updated_at
CREATE TRIGGER update_post_sale_messages_sync_state_updated_at
  BEFORE UPDATE ON public.post_sale_messages_sync_state
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();