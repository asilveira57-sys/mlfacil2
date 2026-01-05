-- Add diagnostic fields to meli_financial_sync_state for better observability
ALTER TABLE public.meli_financial_sync_state
ADD COLUMN IF NOT EXISTS phase text DEFAULT 'idle',
ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz,
ADD COLUMN IF NOT EXISTS last_offset integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_page_size integer DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN public.meli_financial_sync_state.phase IS 'Current phase: idle, fetching, upserting, consolidating, finished, cancelling, error';
COMMENT ON COLUMN public.meli_financial_sync_state.last_heartbeat_at IS 'Last time the sync process updated its state';
COMMENT ON COLUMN public.meli_financial_sync_state.last_offset IS 'Last offset processed in the API pagination';
COMMENT ON COLUMN public.meli_financial_sync_state.last_page_size IS 'Size of the last page fetched';