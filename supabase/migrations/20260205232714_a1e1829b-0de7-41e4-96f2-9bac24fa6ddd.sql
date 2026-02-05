
-- Add buyer_nickname and buyer_name to order_cost_breakdown_cache
-- This eliminates the secondary query to meli_orders_cache for buyer info
ALTER TABLE public.order_cost_breakdown_cache 
ADD COLUMN IF NOT EXISTS buyer_nickname TEXT,
ADD COLUMN IF NOT EXISTS buyer_name TEXT;

-- Backfill existing records with buyer data from meli_orders_cache
UPDATE public.order_cost_breakdown_cache AS obc
SET 
  buyer_nickname = moc.buyer_nickname,
  buyer_name = moc.buyer_name
FROM public.meli_orders_cache AS moc
WHERE obc.order_id = moc.order_id 
  AND obc.seller_id = moc.seller_id
  AND (obc.buyer_nickname IS NULL OR obc.buyer_name IS NULL);
