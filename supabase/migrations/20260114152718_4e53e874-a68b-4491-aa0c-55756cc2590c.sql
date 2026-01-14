-- Add created_at_meli column to order_cost_breakdown_cache for proper date filtering
ALTER TABLE public.order_cost_breakdown_cache 
ADD COLUMN IF NOT EXISTS created_at_meli timestamptz;

-- Backfill existing records with data from meli_orders_cache
UPDATE public.order_cost_breakdown_cache occ
SET 
  revenue_total = COALESCE(moc.total_amount, occ.revenue_total, 0),
  created_at_meli = moc.created_at_meli
FROM public.meli_orders_cache moc
WHERE occ.order_id = moc.order_id
  AND occ.seller_id = moc.seller_id
  AND occ.created_at_meli IS NULL;

-- Create index for efficient date filtering
CREATE INDEX IF NOT EXISTS idx_order_cost_breakdown_created_at_meli 
ON public.order_cost_breakdown_cache (seller_id, created_at_meli DESC);