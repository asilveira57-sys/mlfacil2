-- Create promotion_sync_logs table for tracking sync operations
CREATE TABLE IF NOT EXISTS public.promotion_sync_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'error', 'partial')),
  promotions_fetched INTEGER DEFAULT 0,
  promotions_synced INTEGER DEFAULT 0,
  items_synced INTEGER DEFAULT 0,
  events_created INTEGER DEFAULT 0,
  error_message TEXT,
  error_details JSONB,
  sync_source TEXT DEFAULT 'manual' CHECK (sync_source IN ('manual', 'scheduled', 'webhook')),
  duration_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.promotion_sync_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for promotion_sync_logs
CREATE POLICY "Users can view their own sync logs"
  ON public.promotion_sync_logs
  FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Service role can insert sync logs"
  ON public.promotion_sync_logs
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update sync logs"
  ON public.promotion_sync_logs
  FOR UPDATE
  USING (true);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_promotion_sync_logs_workspace_account 
  ON public.promotion_sync_logs(workspace_id, account_id);

CREATE INDEX IF NOT EXISTS idx_promotion_sync_logs_started_at 
  ON public.promotion_sync_logs(started_at DESC);

-- Add seller_id column to promotion_snapshots if not exists (for unified multi-account)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'promotion_snapshots' 
    AND column_name = 'seller_id'
  ) THEN
    ALTER TABLE public.promotion_snapshots ADD COLUMN seller_id TEXT;
    -- Copy account_id to seller_id for existing records
    UPDATE public.promotion_snapshots SET seller_id = account_id WHERE seller_id IS NULL;
  END IF;
END $$;

-- Add seller_id column to promotion_items_snapshots if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'promotion_items_snapshots' 
    AND column_name = 'seller_id'
  ) THEN
    ALTER TABLE public.promotion_items_snapshots ADD COLUMN seller_id TEXT;
    -- Copy account_id to seller_id for existing records
    UPDATE public.promotion_items_snapshots SET seller_id = account_id WHERE seller_id IS NULL;
  END IF;
END $$;