-- Tabela para armazenar dados financeiros reais do ML (API de billing)
CREATE TABLE public.meli_order_financials_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  shipment_id TEXT,
  
  -- Receitas (valores positivos)
  revenue_products NUMERIC NOT NULL DEFAULT 0,
  revenue_shipping NUMERIC NOT NULL DEFAULT 0,
  
  -- Custos do ML (valores positivos = custo)
  cost_sale_fee NUMERIC NOT NULL DEFAULT 0,
  cost_shipping_fee NUMERIC NOT NULL DEFAULT 0,
  cost_installment_fee NUMERIC NOT NULL DEFAULT 0,
  cost_cancellations NUMERIC NOT NULL DEFAULT 0,
  
  -- Metadados
  billing_period_key TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(seller_id, order_id)
);

-- Habilitar RLS
ALTER TABLE public.meli_order_financials_cache ENABLE ROW LEVEL SECURITY;

-- Policy para usuários acessarem apenas seus dados
CREATE POLICY "meli_order_financials_cache_all"
ON public.meli_order_financials_cache
FOR ALL
USING (auth.uid() = user_id);

-- Índices para performance
CREATE INDEX idx_meli_order_financials_seller_order 
ON public.meli_order_financials_cache(seller_id, order_id);

CREATE INDEX idx_meli_order_financials_user_seller 
ON public.meli_order_financials_cache(user_id, seller_id);