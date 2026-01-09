-- Create table to cache billing details from ML Billing Reports API
CREATE TABLE IF NOT EXISTS public.meli_billing_details_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id TEXT NOT NULL,
  period_key TEXT NOT NULL, -- formato: yyyy-MM-01
  detail_id TEXT NOT NULL, -- ID único do detalhe no billing report
  order_id BIGINT, -- referência ao pedido (pode ser null)
  shipment_id BIGINT, -- referência ao envio (pode ser null)
  charge_type TEXT NOT NULL, -- ex: 'sale_fee', 'shipping_fee', 'installment_cost', etc.
  charge_description TEXT, -- descrição original do ML
  gross_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency_id TEXT DEFAULT 'BRL',
  created_at_meli TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_data JSONB,
  UNIQUE(seller_id, detail_id)
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_billing_details_seller_order 
  ON public.meli_billing_details_cache(seller_id, order_id) 
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_billing_details_seller_shipment 
  ON public.meli_billing_details_cache(seller_id, shipment_id) 
  WHERE shipment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_billing_details_period 
  ON public.meli_billing_details_cache(seller_id, period_key);

-- Enable RLS
ALTER TABLE public.meli_billing_details_cache ENABLE ROW LEVEL SECURITY;

-- RLS policies (service role only - used by edge functions)
CREATE POLICY "Service role full access to billing details"
  ON public.meli_billing_details_cache
  FOR ALL
  USING (true)
  WITH CHECK (true);