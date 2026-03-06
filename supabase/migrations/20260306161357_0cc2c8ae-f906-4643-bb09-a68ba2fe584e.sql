
-- Add last_writer column to order_cost_breakdown_cache
ALTER TABLE public.order_cost_breakdown_cache 
  ADD COLUMN IF NOT EXISTS last_writer TEXT DEFAULT NULL;

-- Add financial tracking columns to cost_calculation_logs
ALTER TABLE public.cost_calculation_logs
  ADD COLUMN IF NOT EXISTS comissao_ml NUMERIC DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS frete_seller NUMERIC DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fee_ml_source TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS writer TEXT DEFAULT NULL;
