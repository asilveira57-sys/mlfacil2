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
 SET statement_timeout TO '45s'
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
  -- Lower bound for the scan: earliest date we actually need
  v_scan_from date := LEAST(v_12_months_ago, v_prev_date_from, v_30d_ago - 30, v_7d_ago - 7);
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
  scoped AS (
    SELECT total_amount, (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date AS d
    FROM meli_orders_cache
    WHERE seller_id = p_seller_id
      AND order_status = 'paid'
      AND created_at_meli >= (v_scan_from::timestamp AT TIME ZONE 'America/Sao_Paulo')
  ),
  metrics AS (
    SELECT
      COALESCE(SUM(CASE WHEN d = v_today THEN 1 ELSE 0 END), 0) as orders_today,
      COALESCE(SUM(CASE WHEN d = v_today THEN total_amount ELSE 0 END), 0) as revenue_today,
      COALESCE(SUM(CASE WHEN d = v_today - 1 THEN 1 ELSE 0 END), 0) as orders_yesterday,
      COALESCE(SUM(CASE WHEN d = v_today - 1 THEN total_amount ELSE 0 END), 0) as revenue_yesterday,
      COALESCE(SUM(CASE WHEN d >= v_7d_ago THEN 1 ELSE 0 END), 0) as orders_7d,
      COALESCE(SUM(CASE WHEN d >= v_7d_ago THEN total_amount ELSE 0 END), 0) as revenue_7d,
      COALESCE(SUM(CASE WHEN d BETWEEN v_7d_ago - 7 AND v_7d_ago - 1 THEN 1 ELSE 0 END), 0) as orders_prev_7d,
      COALESCE(SUM(CASE WHEN d BETWEEN v_7d_ago - 7 AND v_7d_ago - 1 THEN total_amount ELSE 0 END), 0) as revenue_prev_7d,
      COALESCE(SUM(CASE WHEN d >= v_30d_ago THEN 1 ELSE 0 END), 0) as orders_30d,
      COALESCE(SUM(CASE WHEN d >= v_30d_ago THEN total_amount ELSE 0 END), 0) as revenue_30d,
      COALESCE(SUM(CASE WHEN d BETWEEN v_30d_ago - 30 AND v_30d_ago - 1 THEN 1 ELSE 0 END), 0) as orders_prev_30d,
      COALESCE(SUM(CASE WHEN d BETWEEN v_30d_ago - 30 AND v_30d_ago - 1 THEN total_amount ELSE 0 END), 0) as revenue_prev_30d,
      COUNT(*) as orders_total,
      COALESCE(SUM(total_amount), 0) as revenue_total,
      COALESCE(SUM(CASE WHEN d BETWEEN v_date_from AND v_date_to THEN 1 ELSE 0 END), 0) as orders_period,
      COALESCE(SUM(CASE WHEN d BETWEEN v_date_from AND v_date_to THEN total_amount ELSE 0 END), 0) as revenue_period,
      COALESCE(SUM(CASE WHEN d BETWEEN v_prev_date_from AND v_prev_date_to THEN 1 ELSE 0 END), 0) as orders_prev_period,
      COALESCE(SUM(CASE WHEN d BETWEEN v_prev_date_from AND v_prev_date_to THEN total_amount ELSE 0 END), 0) as revenue_prev_period
    FROM scoped
  ),
  monthly_sales AS (
    SELECT
      to_char(date_trunc('month', d), 'YYYY-MM') as month,
      COUNT(*) as orders,
      COALESCE(SUM(total_amount), 0) as revenue
    FROM scoped
    WHERE d >= v_12_months_ago
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