-- Add unique constraint on meli_billing_details_cache for upsert operations
CREATE UNIQUE INDEX IF NOT EXISTS idx_meli_billing_details_cache_unique 
ON public.meli_billing_details_cache (seller_id, period_key, detail_id);

ALTER TABLE public.meli_billing_details_cache 
ADD CONSTRAINT meli_billing_details_cache_unique 
UNIQUE USING INDEX idx_meli_billing_details_cache_unique;