-- =====================================================
-- MÓDULO CUSTO - Tabelas
-- =====================================================

-- Tabela: packaging_cost_settings (configurações de embalagem)
CREATE TABLE public.packaging_cost_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  default_packaging_cost NUMERIC NOT NULL DEFAULT 0,
  packaging_cost_mode TEXT NOT NULL DEFAULT 'por_pedido',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (seller_id, user_id)
);

ALTER TABLE public.packaging_cost_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "packaging_cost_settings_all" ON public.packaging_cost_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Tabela: marketplace_fee_rules (regras de taxa do marketplace)
CREATE TABLE public.marketplace_fee_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'meli',
  fee_mode TEXT NOT NULL DEFAULT 'percentual',
  fee_percent_default NUMERIC NOT NULL DEFAULT 16,
  fee_fixed_default NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (seller_id, user_id, channel)
);

ALTER TABLE public.marketplace_fee_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marketplace_fee_rules_all" ON public.marketplace_fee_rules
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Tabela: order_cost_breakdown_cache (custo detalhado por pedido)
CREATE TABLE public.order_cost_breakdown_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  shipment_id TEXT,
  calculated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  revenue_total NUMERIC NOT NULL DEFAULT 0,
  cost_items_total NUMERIC NOT NULL DEFAULT 0,
  cost_packaging NUMERIC NOT NULL DEFAULT 0,
  cost_fees NUMERIC NOT NULL DEFAULT 0,
  cost_shipping NUMERIC NOT NULL DEFAULT 0,
  cost_other NUMERIC NOT NULL DEFAULT 0,
  cost_total NUMERIC NOT NULL DEFAULT 0,
  profit_total NUMERIC NOT NULL DEFAULT 0,
  margin_percent NUMERIC NOT NULL DEFAULT 0,
  missing_cost_items_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ok',
  notes TEXT,
  UNIQUE (seller_id, order_id)
);

ALTER TABLE public.order_cost_breakdown_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_cost_breakdown_cache_all" ON public.order_cost_breakdown_cache
  FOR ALL USING (auth.uid() = user_id);

-- Tabela: product_profit_aggregate_cache (agregado por produto)
CREATE TABLE public.product_profit_aggregate_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  product_key TEXT NOT NULL,
  period_key TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  revenue_total NUMERIC NOT NULL DEFAULT 0,
  cost_total NUMERIC NOT NULL DEFAULT 0,
  profit_total NUMERIC NOT NULL DEFAULT 0,
  quantity_total INTEGER NOT NULL DEFAULT 0,
  margin_percent NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (seller_id, product_key, period_key)
);

ALTER TABLE public.product_profit_aggregate_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_profit_aggregate_cache_all" ON public.product_profit_aggregate_cache
  FOR ALL USING (auth.uid() = user_id);

-- Tabela: abc_profit_cache (ABC por lucro e faturamento)
CREATE TABLE public.abc_profit_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  period_key TEXT NOT NULL,
  metric TEXT NOT NULL,
  product_key TEXT NOT NULL,
  display_name TEXT,
  value_total NUMERIC NOT NULL DEFAULT 0,
  percent NUMERIC NOT NULL DEFAULT 0,
  cumulative_percent NUMERIC NOT NULL DEFAULT 0,
  class TEXT NOT NULL DEFAULT 'C',
  rank INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (seller_id, period_key, metric, product_key)
);

ALTER TABLE public.abc_profit_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "abc_profit_cache_all" ON public.abc_profit_cache
  FOR ALL USING (auth.uid() = user_id);

-- Adicionar coluna cost_source na tabela existente product_cost_catalog
ALTER TABLE public.product_cost_catalog 
  ADD COLUMN IF NOT EXISTS cost_source TEXT NOT NULL DEFAULT 'manual';

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_order_cost_breakdown_seller_date 
  ON public.order_cost_breakdown_cache(seller_id, calculated_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_profit_aggregate_seller_period 
  ON public.product_profit_aggregate_cache(seller_id, period_key);

CREATE INDEX IF NOT EXISTS idx_abc_profit_cache_seller_period_metric 
  ON public.abc_profit_cache(seller_id, period_key, metric);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_packaging_cost_settings_updated_at
  BEFORE UPDATE ON public.packaging_cost_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_trend_tables_updated_at();

CREATE TRIGGER update_marketplace_fee_rules_updated_at
  BEFORE UPDATE ON public.marketplace_fee_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_trend_tables_updated_at();

CREATE TRIGGER update_product_profit_aggregate_cache_updated_at
  BEFORE UPDATE ON public.product_profit_aggregate_cache
  FOR EACH ROW EXECUTE FUNCTION public.update_trend_tables_updated_at();

CREATE TRIGGER update_abc_profit_cache_updated_at
  BEFORE UPDATE ON public.abc_profit_cache
  FOR EACH ROW EXECUTE FUNCTION public.update_trend_tables_updated_at();