-- Add new columns for clear separation of shipping and commission costs
-- These columns will provide explicit tracking per the user's requirements

-- Add commission_cost (custo de comissão ML) - separate from fee_ml for clarity
ALTER TABLE public.order_cost_breakdown_cache
ADD COLUMN IF NOT EXISTS commission_cost numeric DEFAULT 0;

-- Add shipping_revenue (receita de frete cobrada do cliente)
-- Note: receita_envio already exists but we need a clearer name at API level
-- We'll reuse receita_envio for this purpose

-- Add shipping_balance (saldo do frete = receita - custo)
ALTER TABLE public.order_cost_breakdown_cache
ADD COLUMN IF NOT EXISTS shipping_balance numeric DEFAULT 0;

-- Add revenue_net (receita do produto SEM frete)
ALTER TABLE public.order_cost_breakdown_cache
ADD COLUMN IF NOT EXISTS revenue_net numeric DEFAULT 0;

-- Add cost_net (custo SEM frete, apenas custo produto + comissão + embalagem)
ALTER TABLE public.order_cost_breakdown_cache
ADD COLUMN IF NOT EXISTS cost_net numeric DEFAULT 0;

-- Add profit_net (lucro líquido = revenue_net - cost_net, sem impacto do frete)
ALTER TABLE public.order_cost_breakdown_cache
ADD COLUMN IF NOT EXISTS profit_net numeric DEFAULT 0;

-- Add margin_net (margem líquida baseada em revenue_net e cost_net)
ALTER TABLE public.order_cost_breakdown_cache
ADD COLUMN IF NOT EXISTS margin_net numeric DEFAULT 0;

-- Add missing_fields to track which fields are missing
ALTER TABLE public.order_cost_breakdown_cache
ADD COLUMN IF NOT EXISTS missing_fields text[] DEFAULT '{}';

-- Add comment explaining the fields
COMMENT ON COLUMN public.order_cost_breakdown_cache.commission_cost IS 'Custo de comissão do ML (taxa de venda)';
COMMENT ON COLUMN public.order_cost_breakdown_cache.shipping_balance IS 'Saldo do frete = receita_envio - shipping_cost_seller';
COMMENT ON COLUMN public.order_cost_breakdown_cache.revenue_net IS 'Receita líquida SEM frete = revenue_total - receita_envio';
COMMENT ON COLUMN public.order_cost_breakdown_cache.cost_net IS 'Custo líquido SEM frete = custo_itens + comissão + embalagem';
COMMENT ON COLUMN public.order_cost_breakdown_cache.profit_net IS 'Lucro líquido do produto (sem impacto do frete)';
COMMENT ON COLUMN public.order_cost_breakdown_cache.margin_net IS 'Margem líquida do produto (sem impacto do frete)';
COMMENT ON COLUMN public.order_cost_breakdown_cache.missing_fields IS 'Lista de campos faltantes (ex: sem_comissao, sem_frete_cobrado)';