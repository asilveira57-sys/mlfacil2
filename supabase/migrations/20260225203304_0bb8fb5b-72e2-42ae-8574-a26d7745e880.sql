
-- Add correlation_id to clone_drafts for tracking
ALTER TABLE public.clone_drafts ADD COLUMN IF NOT EXISTS correlation_id text;

-- Add index for fast lookup by correlation_id
CREATE INDEX IF NOT EXISTS idx_clone_drafts_correlation_id ON public.clone_drafts (correlation_id) WHERE correlation_id IS NOT NULL;

-- Add index for status filtering
CREATE INDEX IF NOT EXISTS idx_clone_drafts_status ON public.clone_drafts (status);
