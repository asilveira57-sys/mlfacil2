-- Adicionar campos de custo real por pedido na tabela order_cost_breakdown_cache
-- Estes campos armazenam o custo real extraído das APIs do ML (billing + shipments/costs)

-- Tarifa ML (sale_fee do billing_info)
ALTER TABLE public.order_cost_breakdown_cache 
ADD COLUMN IF NOT EXISTS fee_ml numeric DEFAULT 0;

-- Custo de frete pago pelo seller (do /shipments/{id}/costs)
ALTER TABLE public.order_cost_breakdown_cache 
ADD COLUMN IF NOT EXISTS shipping_cost_seller numeric DEFAULT 0;

-- Custo de parcelamento/juros (installment_fee do billing_info)
ALTER TABLE public.order_cost_breakdown_cache 
ADD COLUMN IF NOT EXISTS installments_cost numeric DEFAULT 0;

-- Ajustes (cancelamentos, compensações, devoluções)
ALTER TABLE public.order_cost_breakdown_cache 
ADD COLUMN IF NOT EXISTS adjustments numeric DEFAULT 0;

-- Total do custo marketplace (fee_ml + shipping_cost_seller + installments_cost + adjustments)
ALTER TABLE public.order_cost_breakdown_cache 
ADD COLUMN IF NOT EXISTS total_marketplace_cost numeric DEFAULT 0;

-- Referências dos movimentos usados para cálculo (ids/refs dos movimentos)
ALTER TABLE public.order_cost_breakdown_cache 
ADD COLUMN IF NOT EXISTS source_refs jsonb;

-- Flag para indicar se o pedido tem custo real completo
ALTER TABLE public.order_cost_breakdown_cache 
ADD COLUMN IF NOT EXISTS has_real_cost boolean DEFAULT false;

-- Data da última sincronização de custo real
ALTER TABLE public.order_cost_breakdown_cache 
ADD COLUMN IF NOT EXISTS real_cost_synced_at timestamp with time zone;

-- Criar índice para buscar pedidos com/sem custo real
CREATE INDEX IF NOT EXISTS idx_order_cost_breakdown_has_real_cost 
ON public.order_cost_breakdown_cache (seller_id, has_real_cost);

-- Criar tabela de cache para custo de frete por shipment_id
CREATE TABLE IF NOT EXISTS public.meli_shipment_costs_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  seller_id text NOT NULL,
  shipment_id text NOT NULL,
  order_id text,
  gross_amount numeric DEFAULT 0,
  sender_cost numeric DEFAULT 0,
  sender_compensation numeric DEFAULT 0,
  receiver_cost numeric DEFAULT 0,
  discounts_json jsonb,
  raw_json jsonb,
  synced_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(seller_id, shipment_id)
);

-- RLS para a nova tabela
ALTER TABLE public.meli_shipment_costs_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own shipment costs" 
ON public.meli_shipment_costs_cache 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own shipment costs" 
ON public.meli_shipment_costs_cache 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own shipment costs" 
ON public.meli_shipment_costs_cache 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own shipment costs" 
ON public.meli_shipment_costs_cache 
FOR DELETE 
USING (auth.uid() = user_id);

-- Índice para busca por order_id
CREATE INDEX IF NOT EXISTS idx_shipment_costs_order_id 
ON public.meli_shipment_costs_cache (seller_id, order_id);