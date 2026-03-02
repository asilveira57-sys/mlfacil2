-- Add shipping_state column to meli_orders_cache for DIFAL calculation
ALTER TABLE public.meli_orders_cache ADD COLUMN IF NOT EXISTS shipping_state varchar(2);