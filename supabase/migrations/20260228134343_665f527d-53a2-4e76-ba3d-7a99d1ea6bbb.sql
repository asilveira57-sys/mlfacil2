-- Add last_checked_at to track when each pending order was last verified
ALTER TABLE public.order_cost_breakdown_cache 
ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ DEFAULT NULL;

-- Add last_pending_count to real costs sync state to detect loops
ALTER TABLE public.meli_real_costs_sync_state 
ADD COLUMN IF NOT EXISTS last_pending_count INTEGER DEFAULT NULL;

-- Index for efficient cooldown queries on pending orders
CREATE INDEX IF NOT EXISTS idx_ocbc_pending_last_checked 
ON public.order_cost_breakdown_cache (seller_id, fee_ml_source, last_checked_at) 
WHERE fee_ml_source = 'pending';