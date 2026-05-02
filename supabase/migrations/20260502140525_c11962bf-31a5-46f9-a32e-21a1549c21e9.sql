
-- get_sales_metrics: add p_user_id parameter, validate ownership against it
CREATE OR REPLACE FUNCTION public.get_sales_metrics(
  p_seller_id text,
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date,
  p_user_id uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date;
  v_7d_ago date := v_today - INTERVAL '7 days';
  v_30d_ago date := v_today - INTERVAL '30 days';
  v_date_from date := COALESCE(p_date_from, v_30d_ago);
  v_date_to date := COALESCE(p_date_to, v_today);
  v_period_days integer := v_date_to - v_date_from + 1;
  v_prev_date_from date := v_date_from - v_period_days;
  v_prev_date_to date := v_date_from - 1;
  v_12_months_ago date := v_today - INTERVAL '12 months';
  v_caller uuid := COALESCE(p_user_id, auth.uid());
  v_result jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ml_accounts
    WHERE ml_user_id = p_seller_id AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'Access denied to seller_id %', p_seller_id;
  END IF;

  WITH
  metrics AS (
    SELECT
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date = v_today THEN 1 ELSE 0 END), 0) as orders_today,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date = v_today THEN total_amount ELSE 0 END), 0) as revenue_today,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date = v_today - 1 THEN 1 ELSE 0 END), 0) as orders_yesterday,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date = v_today - 1 THEN total_amount ELSE 0 END), 0) as revenue_yesterday,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date >= v_7d_ago THEN 1 ELSE 0 END), 0) as orders_7d,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date >= v_7d_ago THEN total_amount ELSE 0 END), 0) as revenue_7d,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_7d_ago - 7 AND v_7d_ago - 1 THEN 1 ELSE 0 END), 0) as orders_prev_7d,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_7d_ago - 7 AND v_7d_ago - 1 THEN total_amount ELSE 0 END), 0) as revenue_prev_7d,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date >= v_30d_ago THEN 1 ELSE 0 END), 0) as orders_30d,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date >= v_30d_ago THEN total_amount ELSE 0 END), 0) as revenue_30d,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_30d_ago - 30 AND v_30d_ago - 1 THEN 1 ELSE 0 END), 0) as orders_prev_30d,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_30d_ago - 30 AND v_30d_ago - 1 THEN total_amount ELSE 0 END), 0) as revenue_prev_30d,
      COUNT(*) as orders_total,
      COALESCE(SUM(total_amount), 0) as revenue_total,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_date_from AND v_date_to THEN 1 ELSE 0 END), 0) as orders_period,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_date_from AND v_date_to THEN total_amount ELSE 0 END), 0) as revenue_period,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_prev_date_from AND v_prev_date_to THEN 1 ELSE 0 END), 0) as orders_prev_period,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_prev_date_from AND v_prev_date_to THEN total_amount ELSE 0 END), 0) as revenue_prev_period
    FROM meli_orders_cache
    WHERE seller_id = p_seller_id AND order_status = 'paid'
  ),
  monthly_sales AS (
    SELECT
      to_char(date_trunc('month', created_at_meli AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM') as month,
      COUNT(*) as orders,
      COALESCE(SUM(total_amount), 0) as revenue
    FROM meli_orders_cache
    WHERE seller_id = p_seller_id
      AND order_status = 'paid'
      AND (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date >= v_12_months_ago
    GROUP BY 1
    ORDER BY 1
  )
  SELECT jsonb_build_object(
    'metrics', to_jsonb(m.*),
    'monthly_sales', COALESCE((SELECT jsonb_agg(to_jsonb(ms.*) ORDER BY ms.month) FROM monthly_sales ms), '[]'::jsonb)
  ) INTO v_result
  FROM metrics m;

  RETURN v_result;
END;
$function$;

-- get_orders_needing_cost_sync: add p_user_id
DROP FUNCTION IF EXISTS public.get_orders_needing_cost_sync(text, integer, integer);
CREATE FUNCTION public.get_orders_needing_cost_sync(
  p_seller_id text,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0,
  p_user_id uuid DEFAULT NULL::uuid
)
 RETURNS TABLE(order_id text, shipment_id text, total_amount numeric, created_at_meli timestamptz, current_fee_ml_source text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := COALESCE(p_user_id, auth.uid());
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ml_accounts
    WHERE ml_user_id = p_seller_id AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'Access denied to seller_id %', p_seller_id;
  END IF;

  RETURN QUERY
  SELECT
    o.order_id,
    o.shipment_id,
    o.total_amount,
    o.created_at_meli,
    b.fee_ml_source AS current_fee_ml_source
  FROM meli_orders_cache o
  LEFT JOIN order_cost_breakdown_cache b
    ON b.seller_id = o.seller_id AND b.order_id = o.order_id
  WHERE o.seller_id = p_seller_id
    AND o.order_status = 'paid'
    AND (b.order_id IS NULL OR b.fee_ml_source = 'pending')
  ORDER BY o.created_at_meli ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

-- count_orders_needing_cost_sync: add p_user_id
CREATE OR REPLACE FUNCTION public.count_orders_needing_cost_sync(
  p_seller_id text,
  p_user_id uuid DEFAULT NULL::uuid
)
 RETURNS TABLE(total_pending bigint, no_breakdown bigint, pending_billing bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := COALESCE(p_user_id, auth.uid());
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ml_accounts
    WHERE ml_user_id = p_seller_id AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'Access denied to seller_id %', p_seller_id;
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*) as total_pending,
    COUNT(*) FILTER (WHERE b.order_id IS NULL) as no_breakdown,
    COUNT(*) FILTER (WHERE b.fee_ml_source = 'pending') as pending_billing
  FROM meli_orders_cache o
  LEFT JOIN order_cost_breakdown_cache b
    ON b.seller_id = o.seller_id AND b.order_id = o.order_id
  WHERE o.seller_id = p_seller_id
    AND o.order_status = 'paid'
    AND (b.order_id IS NULL OR b.fee_ml_source = 'pending');
END;
$function$;
