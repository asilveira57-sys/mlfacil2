
-- 1. Create cost_calc_jobs table for persistent job tracking
CREATE TABLE IF NOT EXISTS public.cost_calc_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id text NOT NULL,
  user_id uuid NULL,
  date_from timestamptz NOT NULL,
  date_to timestamptz NOT NULL,
  period_days int NULL,
  status text NOT NULL DEFAULT 'queued',
  "offset" int NOT NULL DEFAULT 0,
  batch_size int NOT NULL DEFAULT 500,
  total_orders int NULL,
  processed_orders int NOT NULL DEFAULT 0,
  started_at timestamptz NULL,
  finished_at timestamptz NULL,
  last_heartbeat timestamptz NULL,
  last_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cost_calc_jobs_seller_status ON public.cost_calc_jobs (seller_id, status);
CREATE INDEX IF NOT EXISTS idx_cost_calc_jobs_seller_dates ON public.cost_calc_jobs (seller_id, date_from, date_to);
CREATE INDEX IF NOT EXISTS idx_cost_calc_jobs_status_updated ON public.cost_calc_jobs (status, updated_at);

-- Trigger update updated_at
CREATE TRIGGER set_cost_calc_jobs_updated_at
  BEFORE UPDATE ON public.cost_calc_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.cost_calc_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own jobs"
  ON public.cost_calc_jobs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service can manage all jobs"
  ON public.cost_calc_jobs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2. Create get_cost_summary_v2 RPC with coverage metrics
CREATE OR REPLACE FUNCTION public.get_cost_summary_v2(
  p_seller_id text,
  p_date_from timestamptz,
  p_date_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH imported AS (
    SELECT COUNT(*) as cnt
    FROM meli_orders_cache
    WHERE seller_id = p_seller_id
      AND order_status = 'paid'
      AND created_at_meli >= p_date_from
      AND created_at_meli <= p_date_to
  ),
  calculated AS (
    SELECT
      COUNT(*) as order_count,
      COALESCE(SUM(revenue_total), 0) as total_revenue,
      COALESCE(SUM(cost_items_total), 0) as total_cost_product,
      COALESCE(SUM(GREATEST(
        COALESCE(cost_shipping, 0),
        COALESCE(shipping_cost_seller, 0)
      )), 0) as total_cost_shipping,
      COALESCE(SUM(COALESCE(commission_cost, cost_fees, 0)), 0) as total_cost_marketplace,
      COALESCE(SUM(COALESCE(cost_packaging, 0)), 0) as total_cost_packaging,
      COALESCE(SUM(COALESCE(tax_value, 0)), 0) as total_cost_tax,
      COALESCE(SUM(COALESCE(installments_cost, 0)), 0) as total_installments,
      COALESCE(SUM(COALESCE(cost_other, 0)), 0) as total_cost_other,
      COALESCE(SUM(cost_total), 0) as total_cost,
      COALESCE(SUM(profit_total), 0) as total_profit,
      COALESCE(AVG(margin_percent), 0) as avg_margin,
      COUNT(*) FILTER (WHERE missing_cost_items_count > 0) as incomplete_count,
      COUNT(*) FILTER (WHERE missing_cost_items_count > 0 OR fee_ml_source IN ('pending', 'no_charges')) as missing_cost_count
    FROM order_cost_breakdown_cache
    WHERE seller_id = p_seller_id
      AND created_at_meli >= p_date_from
      AND created_at_meli <= p_date_to
  ),
  cancelled AS (
    SELECT 
      COUNT(*) as cancelled_count,
      COALESCE(SUM(total_amount), 0) as cancelled_vgv
    FROM meli_orders_cache
    WHERE seller_id = p_seller_id
      AND order_status IN ('cancelled', 'refunded', 'partially_refunded')
      AND created_at_meli >= p_date_from
      AND created_at_meli <= p_date_to
  )
  SELECT jsonb_build_object(
    'total_revenue', c.total_revenue,
    'total_cost', c.total_cost,
    'total_profit', c.total_profit,
    'total_cost_product', c.total_cost_product,
    'total_cost_shipping', c.total_cost_shipping,
    'total_cost_marketplace', c.total_cost_marketplace,
    'total_cost_packaging', c.total_cost_packaging,
    'total_cost_tax', c.total_cost_tax,
    'total_installments', c.total_installments,
    'total_cost_other', c.total_cost_other,
    'avg_margin', c.avg_margin,
    'order_count', c.order_count,
    'incomplete_count', c.incomplete_count,
    'incomplete_percent', CASE WHEN c.order_count > 0 THEN (c.incomplete_count::numeric / c.order_count * 100) ELSE 0 END,
    'missing_cost_count', c.missing_cost_count,
    'orders_imported', i.cnt,
    'orders_calculated', c.order_count,
    'coverage_percent', CASE WHEN i.cnt > 0 THEN ROUND((c.order_count::numeric / i.cnt * 100), 1) ELSE 0 END,
    'cancelled_count', ca.cancelled_count,
    'cancelled_vgv', ca.cancelled_vgv
  )
  INTO v_result
  FROM calculated c, imported i, cancelled ca;
  
  RETURN v_result;
END;
$$;

-- 3. Add index on meli_orders_cache for fast date filtering
CREATE INDEX IF NOT EXISTS idx_meli_orders_cache_seller_date ON public.meli_orders_cache (seller_id, created_at_meli DESC);
CREATE INDEX IF NOT EXISTS idx_order_cost_breakdown_seller_date ON public.order_cost_breakdown_cache (seller_id, created_at_meli DESC);
