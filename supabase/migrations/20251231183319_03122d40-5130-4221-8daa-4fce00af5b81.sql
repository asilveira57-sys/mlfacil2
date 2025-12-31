-- =====================================================
-- ABC ANALYSIS MODULE: Schema Migration
-- =====================================================

-- 1. Add geographic fields to meli_shipments_cache for structured address data
ALTER TABLE public.meli_shipments_cache
  ADD COLUMN IF NOT EXISTS shipping_state_uf text,
  ADD COLUMN IF NOT EXISTS shipping_city text,
  ADD COLUMN IF NOT EXISTS shipping_neighborhood text,
  ADD COLUMN IF NOT EXISTS shipping_zipcode text;

-- 2. Create CEP cache table for ViaCEP responses
CREATE TABLE IF NOT EXISTS public.cep_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  zipcode text NOT NULL UNIQUE,
  neighborhood text,
  city text,
  state_uf text,
  street text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on cep_cache (public read, admin write)
ALTER TABLE public.cep_cache ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read CEP cache (public data)
CREATE POLICY "cep_cache_select_all" 
ON public.cep_cache 
FOR SELECT 
USING (true);

-- 3. Create ABC configuration table per seller
CREATE TABLE IF NOT EXISTS public.abc_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  seller_id text NOT NULL,
  percent_a integer NOT NULL DEFAULT 70,
  percent_b integer NOT NULL DEFAULT 20,
  percent_c integer NOT NULL DEFAULT 10,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT abc_config_seller_unique UNIQUE (seller_id)
);

-- Enable RLS
ALTER TABLE public.abc_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "abc_config_all" 
ON public.abc_config 
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 4. Create indexes for ABC analysis queries
CREATE INDEX IF NOT EXISTS idx_shipments_state_uf ON public.meli_shipments_cache(shipping_state_uf);
CREATE INDEX IF NOT EXISTS idx_shipments_city ON public.meli_shipments_cache(shipping_city);
CREATE INDEX IF NOT EXISTS idx_shipments_neighborhood ON public.meli_shipments_cache(shipping_neighborhood);
CREATE INDEX IF NOT EXISTS idx_shipments_zipcode ON public.meli_shipments_cache(shipping_zipcode);

-- 5. Create composite indexes for efficient ABC queries
CREATE INDEX IF NOT EXISTS idx_orders_seller_status_date 
ON public.meli_orders_cache(seller_id, order_status, created_at_meli);

CREATE INDEX IF NOT EXISTS idx_order_items_seller_product 
ON public.meli_order_items_cache(seller_id, product_key);

-- 6. Add trigger for abc_config updated_at
CREATE OR REPLACE FUNCTION public.update_abc_config_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_abc_config_updated_at ON public.abc_config;
CREATE TRIGGER update_abc_config_updated_at
  BEFORE UPDATE ON public.abc_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_abc_config_updated_at();

-- 7. Add trigger for cep_cache updated_at
DROP TRIGGER IF EXISTS update_cep_cache_updated_at ON public.cep_cache;
CREATE TRIGGER update_cep_cache_updated_at
  BEFORE UPDATE ON public.cep_cache
  FOR EACH ROW
  EXECUTE FUNCTION public.update_abc_config_updated_at();