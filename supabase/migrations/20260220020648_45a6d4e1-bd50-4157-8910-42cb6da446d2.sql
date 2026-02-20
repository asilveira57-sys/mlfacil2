
-- =====================================================
-- Retrospective Reports Module
-- =====================================================

-- 1. Main reports table
CREATE TABLE public.retrospective_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('mensal', 'trimestral', 'anual', 'ano_letivo')),
  periodo_inicio DATE NOT NULL,
  periodo_fim DATE NOT NULL,
  json_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  pdf_url TEXT,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'error')),
  error_message TEXT,
  company_name TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes (no artificial limits)
CREATE INDEX idx_retro_reports_user_seller ON public.retrospective_reports (user_id, seller_id);
CREATE INDEX idx_retro_reports_periodo ON public.retrospective_reports (periodo_inicio, periodo_fim);
CREATE INDEX idx_retro_reports_created ON public.retrospective_reports (created_at DESC);
CREATE INDEX idx_retro_reports_tipo ON public.retrospective_reports (tipo);

-- Updated_at trigger
CREATE TRIGGER update_retrospective_reports_updated_at
  BEFORE UPDATE ON public.retrospective_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.retrospective_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reports"
  ON public.retrospective_reports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reports"
  ON public.retrospective_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reports"
  ON public.retrospective_reports FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own reports"
  ON public.retrospective_reports FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all reports"
  ON public.retrospective_reports FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. RPC function to generate retrospective snapshot
-- Consolidates ALL data for seller+period without limits
CREATE OR REPLACE FUNCTION public.generate_retrospective_snapshot(
  p_user_id UUID,
  p_seller_id TEXT,
  p_periodo_inicio DATE,
  p_periodo_fim DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_result JSONB;
  v_period_days INTEGER;
  v_prev_inicio DATE;
  v_prev_fim DATE;
BEGIN
  v_period_days := p_periodo_fim - p_periodo_inicio + 1;
  v_prev_inicio := p_periodo_inicio - v_period_days;
  v_prev_fim := p_periodo_inicio - 1;

  WITH
  -- Current period orders (ALL, no LIMIT)
  current_orders AS (
    SELECT
      COUNT(*) as total_orders,
      COALESCE(SUM(total_amount), 0) as total_revenue,
      CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(total_amount), 0) / COUNT(*) ELSE 0 END as avg_ticket,
      MIN(created_at_meli) as first_order_at,
      MAX(created_at_meli) as last_order_at
    FROM meli_orders_cache
    WHERE seller_id = p_seller_id
      AND user_id = p_user_id
      AND order_status = 'paid'
      AND (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date
        BETWEEN p_periodo_inicio AND p_periodo_fim
  ),
  -- Previous period orders for comparison
  prev_orders AS (
    SELECT
      COUNT(*) as total_orders,
      COALESCE(SUM(total_amount), 0) as total_revenue,
      CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(total_amount), 0) / COUNT(*) ELSE 0 END as avg_ticket
    FROM meli_orders_cache
    WHERE seller_id = p_seller_id
      AND user_id = p_user_id
      AND order_status = 'paid'
      AND (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date
        BETWEEN v_prev_inicio AND v_prev_fim
  ),
  -- Cancelled orders current period
  cancelled AS (
    SELECT
      COUNT(*) as total_cancelled,
      COALESCE(SUM(total_amount), 0) as cancelled_revenue
    FROM meli_orders_cache
    WHERE seller_id = p_seller_id
      AND user_id = p_user_id
      AND order_status IN ('cancelled', 'refunded', 'partially_refunded')
      AND (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date
        BETWEEN p_periodo_inicio AND p_periodo_fim
  ),
  -- Cost/profit breakdown (ALL orders, no LIMIT)
  cost_data AS (
    SELECT
      COALESCE(SUM(b.revenue_total), 0) as sum_revenue,
      COALESCE(SUM(b.cost_total), 0) as sum_costs,
      COALESCE(SUM(b.profit_total), 0) as sum_profit,
      CASE WHEN SUM(b.revenue_total) > 0
        THEN (SUM(b.profit_total) / SUM(b.revenue_total)) * 100
        ELSE 0
      END as avg_margin,
      COALESCE(SUM(b.cost_fees), 0) as sum_fees,
      COALESCE(SUM(b.cost_shipping), 0) as sum_shipping_cost,
      COUNT(*) as orders_with_costs
    FROM order_cost_breakdown_cache b
    INNER JOIN meli_orders_cache o
      ON o.seller_id = b.seller_id AND o.order_id = b.order_id
    WHERE b.seller_id = p_seller_id
      AND b.user_id = p_user_id
      AND o.order_status = 'paid'
      AND (o.created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date
        BETWEEN p_periodo_inicio AND p_periodo_fim
  ),
  -- ADS metrics (ALL, no LIMIT)
  ads_data AS (
    SELECT
      COALESCE(SUM(total_spent), 0) as total_ads_spent,
      COALESCE(SUM(total_revenue), 0) as total_ads_revenue,
      COALESCE(SUM(total_clicks), 0) as total_clicks,
      COALESCE(SUM(total_impressions), 0) as total_impressions,
      COALESCE(SUM(total_conversions), 0) as total_conversions,
      CASE WHEN SUM(total_revenue) > 0
        THEN (SUM(total_spent) / SUM(total_revenue)) * 100
        ELSE 0
      END as acos
    FROM ads_period_cache
    WHERE seller_id = p_seller_id
      AND user_id = p_user_id
      AND metric_date::date BETWEEN p_periodo_inicio AND p_periodo_fim
  ),
  -- Monthly breakdown (ALL months)
  monthly_breakdown AS (
    SELECT
      to_char(date_trunc('month', (created_at_meli AT TIME ZONE 'America/Sao_Paulo')), 'YYYY-MM') as month,
      COUNT(*) as orders,
      COALESCE(SUM(total_amount), 0) as revenue
    FROM meli_orders_cache
    WHERE seller_id = p_seller_id
      AND user_id = p_user_id
      AND order_status = 'paid'
      AND (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date
        BETWEEN p_periodo_inicio AND p_periodo_fim
    GROUP BY 1
    ORDER BY 1
  ),
  -- Top products (ALL products, no LIMIT)
  top_products AS (
    SELECT
      i.product_key as product_id,
      COALESCE(i.title_short, i.title, i.item_id) as title,
      SUM(i.quantity) as total_units,
      SUM(i.quantity * i.unit_price) as total_revenue
    FROM meli_order_items_cache i
    INNER JOIN meli_orders_cache o
      ON o.seller_id = i.seller_id AND o.order_id = i.order_id
    WHERE i.seller_id = p_seller_id
      AND i.user_id = p_user_id
      AND o.order_status = 'paid'
      AND (o.created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date
        BETWEEN p_periodo_inicio AND p_periodo_fim
    GROUP BY i.product_key, i.title_short, i.title, i.item_id
    ORDER BY total_revenue DESC
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'periodo', jsonb_build_object(
      'inicio', p_periodo_inicio,
      'fim', p_periodo_fim,
      'dias', v_period_days,
      'prev_inicio', v_prev_inicio,
      'prev_fim', v_prev_fim
    ),
    'vendas', jsonb_build_object(
      'total_pedidos', co.total_orders,
      'faturamento', co.total_revenue,
      'ticket_medio', co.avg_ticket,
      'primeiro_pedido', co.first_order_at,
      'ultimo_pedido', co.last_order_at,
      'prev_total_pedidos', po.total_orders,
      'prev_faturamento', po.total_revenue,
      'prev_ticket_medio', po.avg_ticket,
      'variacao_pedidos', CASE WHEN po.total_orders > 0
        THEN ((co.total_orders::numeric - po.total_orders) / po.total_orders) * 100
        ELSE 0 END,
      'variacao_faturamento', CASE WHEN po.total_revenue > 0
        THEN ((co.total_revenue - po.total_revenue) / po.total_revenue) * 100
        ELSE 0 END
    ),
    'cancelamentos', jsonb_build_object(
      'total', cn.total_cancelled,
      'valor', cn.cancelled_revenue
    ),
    'custos', jsonb_build_object(
      'receita', cd.sum_revenue,
      'custo_total', cd.sum_costs,
      'lucro', cd.sum_profit,
      'margem_media', cd.avg_margin,
      'taxas_ml', cd.sum_fees,
      'custo_envio', cd.sum_shipping_cost,
      'pedidos_com_custo', cd.orders_with_costs
    ),
    'ads', jsonb_build_object(
      'investimento', ad.total_ads_spent,
      'receita_ads', ad.total_ads_revenue,
      'clicks', ad.total_clicks,
      'impressoes', ad.total_impressions,
      'conversoes', ad.total_conversions,
      'acos', ad.acos,
      'roas', CASE WHEN ad.total_ads_spent > 0
        THEN ad.total_ads_revenue / ad.total_ads_spent
        ELSE 0 END,
      'tacos', CASE WHEN co.total_revenue > 0
        THEN (ad.total_ads_spent / co.total_revenue) * 100
        ELSE 0 END
    ),
    'mensal', (SELECT COALESCE(jsonb_agg(
      jsonb_build_object('month', mb.month, 'orders', mb.orders, 'revenue', mb.revenue)
    ), '[]'::jsonb) FROM monthly_breakdown mb),
    'top_produtos', (SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'product_id', tp.product_id,
        'title', tp.title,
        'units', tp.total_units,
        'revenue', tp.total_revenue
      )
    ), '[]'::jsonb) FROM top_products tp)
  )
  INTO v_result
  FROM current_orders co, prev_orders po, cancelled cn, cost_data cd, ads_data ad;

  RETURN v_result;
END;
$$;
