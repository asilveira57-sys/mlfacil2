-- Drop and recreate the function with monthly sales data
CREATE OR REPLACE FUNCTION public.get_sales_metrics(p_seller_id text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date)
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
  v_result jsonb;
BEGIN
  WITH 
  -- Metrics for paid orders
  metrics AS (
    SELECT
      -- Today
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date = v_today THEN 1 ELSE 0 END), 0) as orders_today,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date = v_today THEN total_amount ELSE 0 END), 0) as revenue_today,
      -- Yesterday for comparison
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date = v_today - 1 THEN 1 ELSE 0 END), 0) as orders_yesterday,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date = v_today - 1 THEN total_amount ELSE 0 END), 0) as revenue_yesterday,
      -- 7 days
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date >= v_7d_ago THEN 1 ELSE 0 END), 0) as orders_7d,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date >= v_7d_ago THEN total_amount ELSE 0 END), 0) as revenue_7d,
      -- Previous 7 days (7-14 days ago)
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_7d_ago - 7 AND v_7d_ago - 1 THEN 1 ELSE 0 END), 0) as orders_prev_7d,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_7d_ago - 7 AND v_7d_ago - 1 THEN total_amount ELSE 0 END), 0) as revenue_prev_7d,
      -- 30 days
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date >= v_30d_ago THEN 1 ELSE 0 END), 0) as orders_30d,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date >= v_30d_ago THEN total_amount ELSE 0 END), 0) as revenue_30d,
      -- Previous 30 days (30-60 days ago)
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_30d_ago - 30 AND v_30d_ago - 1 THEN 1 ELSE 0 END), 0) as orders_prev_30d,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_30d_ago - 30 AND v_30d_ago - 1 THEN total_amount ELSE 0 END), 0) as revenue_prev_30d,
      -- Total all time
      COUNT(*) as orders_total,
      COALESCE(SUM(total_amount), 0) as revenue_total,
      -- Filtered period
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_date_from AND v_date_to THEN 1 ELSE 0 END), 0) as orders_period,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_date_from AND v_date_to THEN total_amount ELSE 0 END), 0) as revenue_period,
      -- Previous period (same length, immediately before)
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_prev_date_from AND v_prev_date_to THEN 1 ELSE 0 END), 0) as orders_prev_period,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_prev_date_from AND v_prev_date_to THEN total_amount ELSE 0 END), 0) as revenue_prev_period,
      -- Sync counters
      COUNT(*) FILTER (WHERE items_synced_at IS NOT NULL) as orders_with_items_synced
    FROM public.meli_orders_cache
    WHERE seller_id = p_seller_id
      AND order_status = 'paid'
  ),
  -- Cancelled/refunded metrics
  cancelled_metrics AS (
    SELECT
      COUNT(*) as cancelled_orders,
      COALESCE(SUM(total_amount), 0) as cancelled_revenue,
      -- Filtered period cancelled
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_date_from AND v_date_to THEN 1 ELSE 0 END), 0) as cancelled_orders_period,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_date_from AND v_date_to THEN total_amount ELSE 0 END), 0) as cancelled_revenue_period
    FROM public.meli_orders_cache
    WHERE seller_id = p_seller_id
      AND order_status IN ('cancelled', 'refunded', 'partially_refunded')
  ),
  -- Daily series for the filtered period
  date_series AS (
    SELECT generate_series(v_date_from, v_date_to, '1 day'::interval)::date as dt
  ),
  daily_agg AS (
    SELECT 
      (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date as dt,
      COUNT(*) as orders,
      COALESCE(SUM(total_amount), 0) as revenue
    FROM public.meli_orders_cache
    WHERE seller_id = p_seller_id
      AND order_status = 'paid'
      AND (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_date_from AND v_date_to
    GROUP BY 1
  ),
  daily_filled AS (
    SELECT 
      ds.dt::text as date,
      COALESCE(da.orders, 0) as orders,
      COALESCE(da.revenue, 0) as revenue
    FROM date_series ds
    LEFT JOIN daily_agg da ON ds.dt = da.dt
    ORDER BY ds.dt
  ),
  -- Monthly series for the last 12 months (for annual chart)
  month_series AS (
    SELECT generate_series(
      date_trunc('month', v_12_months_ago),
      date_trunc('month', v_today),
      '1 month'::interval
    )::date as month_start
  ),
  monthly_sales_agg AS (
    SELECT 
      date_trunc('month', (created_at_meli AT TIME ZONE 'America/Sao_Paulo'))::date as month_start,
      COUNT(*) as orders,
      COALESCE(SUM(total_amount), 0) as revenue
    FROM public.meli_orders_cache
    WHERE seller_id = p_seller_id
      AND order_status = 'paid'
      AND (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date >= v_12_months_ago
    GROUP BY 1
  ),
  monthly_sales_filled AS (
    SELECT 
      to_char(ms.month_start, 'YYYY-MM') as month,
      to_char(ms.month_start, 'TMMonth') as month_label,
      COALESCE(msa.orders, 0) as orders,
      COALESCE(msa.revenue, 0) as revenue
    FROM month_series ms
    LEFT JOIN monthly_sales_agg msa ON ms.month_start = msa.month_start
    ORDER BY ms.month_start
  ),
  -- Monthly cancelled for the last 12 months
  monthly_cancelled_agg AS (
    SELECT 
      date_trunc('month', (created_at_meli AT TIME ZONE 'America/Sao_Paulo'))::date as month_start,
      COUNT(*) as orders,
      COALESCE(SUM(total_amount), 0) as revenue
    FROM public.meli_orders_cache
    WHERE seller_id = p_seller_id
      AND order_status IN ('cancelled', 'refunded', 'partially_refunded')
      AND (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date >= v_12_months_ago
    GROUP BY 1
  ),
  monthly_cancelled_filled AS (
    SELECT 
      to_char(ms.month_start, 'YYYY-MM') as month,
      to_char(ms.month_start, 'TMMonth') as month_label,
      COALESCE(mca.orders, 0) as orders,
      COALESCE(mca.revenue, 0) as revenue
    FROM month_series ms
    LEFT JOIN monthly_cancelled_agg mca ON ms.month_start = mca.month_start
    ORDER BY ms.month_start
  ),
  -- Top products for filtered period
  top_products AS (
    SELECT 
      i.product_key as id,
      COALESCE(i.title_short, i.title, i.item_id) as title,
      SUM(i.quantity) as quantity,
      SUM(i.quantity * i.unit_price) as revenue
    FROM public.meli_order_items_cache i
    INNER JOIN public.meli_orders_cache o 
      ON o.seller_id = i.seller_id AND o.order_id = i.order_id
    WHERE i.seller_id = p_seller_id
      AND o.order_status = 'paid'
      AND (o.created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_date_from AND v_date_to
    GROUP BY i.product_key, i.title_short, i.title, i.item_id
    ORDER BY revenue DESC
    LIMIT 10
  ),
  -- Available months for filter dropdown
  available_months AS (
    SELECT DISTINCT 
      to_char(created_at_meli AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') as month_key,
      to_char(created_at_meli AT TIME ZONE 'America/Sao_Paulo', 'TMMonth YYYY') as month_label
    FROM public.meli_orders_cache
    WHERE seller_id = p_seller_id
    ORDER BY month_key DESC
  ),
  -- Items count in cache
  items_count AS (
    SELECT COUNT(*) as total_items
    FROM public.meli_order_items_cache
    WHERE seller_id = p_seller_id
  )
  SELECT jsonb_build_object(
    'ordersToday', m.orders_today,
    'revenueToday', m.revenue_today,
    'ordersYesterday', m.orders_yesterday,
    'revenueYesterday', m.revenue_yesterday,
    'orders7d', m.orders_7d,
    'revenue7d', m.revenue_7d,
    'ordersPrev7d', m.orders_prev_7d,
    'revenuePrev7d', m.revenue_prev_7d,
    'orders30d', m.orders_30d,
    'revenue30d', m.revenue_30d,
    'ordersPrev30d', m.orders_prev_30d,
    'revenuePrev30d', m.revenue_prev_30d,
    'ordersTotal', m.orders_total,
    'revenueTotal', m.revenue_total,
    'ordersPeriod', m.orders_period,
    'revenuePeriod', m.revenue_period,
    'ordersPrevPeriod', m.orders_prev_period,
    'revenuePrevPeriod', m.revenue_prev_period,
    'averageTicket', CASE WHEN m.orders_total > 0 THEN m.revenue_total / m.orders_total ELSE 0 END,
    'averageTicket30d', CASE WHEN m.orders_30d > 0 THEN m.revenue_30d / m.orders_30d ELSE 0 END,
    'averageTicketPeriod', CASE WHEN m.orders_period > 0 THEN m.revenue_period / m.orders_period ELSE 0 END,
    'averageTicketPrevPeriod', CASE WHEN m.orders_prev_period > 0 THEN m.revenue_prev_period / m.orders_prev_period ELSE 0 END,
    'cancelledOrders', cm.cancelled_orders,
    'cancelledRevenue', cm.cancelled_revenue,
    'cancelledOrdersPeriod', cm.cancelled_orders_period,
    'cancelledRevenuePeriod', cm.cancelled_revenue_period,
    'dailySales', (SELECT jsonb_agg(jsonb_build_object('date', df.date, 'orders', df.orders, 'revenue', df.revenue)) FROM daily_filled df),
    'monthlySales', (SELECT COALESCE(jsonb_agg(jsonb_build_object('month', msf.month, 'monthLabel', msf.month_label, 'orders', msf.orders, 'revenue', msf.revenue)), '[]'::jsonb) FROM monthly_sales_filled msf),
    'monthlyCancelled', (SELECT COALESCE(jsonb_agg(jsonb_build_object('month', mcf.month, 'monthLabel', mcf.month_label, 'orders', mcf.orders, 'revenue', mcf.revenue)), '[]'::jsonb) FROM monthly_cancelled_filled mcf),
    'topProducts', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', tp.id, 'title', tp.title, 'quantity', tp.quantity, 'revenue', tp.revenue)), '[]'::jsonb) FROM top_products tp),
    'availableMonths', (SELECT COALESCE(jsonb_agg(jsonb_build_object('key', am.month_key, 'label', am.month_label)), '[]'::jsonb) FROM available_months am),
    '_debug', jsonb_build_object(
      'cachedOrdersCount', m.orders_total,
      'cachedItemsCount', ic.total_items,
      'ordersWithItemsSynced', m.orders_with_items_synced,
      'itemsSyncedPercent', CASE WHEN m.orders_total > 0 THEN ROUND((m.orders_with_items_synced::numeric / m.orders_total) * 100, 1) ELSE 0 END,
      'source', 'rpc_get_sales_metrics_v4',
      'dateFrom', v_date_from,
      'dateTo', v_date_to,
      'prevDateFrom', v_prev_date_from,
      'prevDateTo', v_prev_date_to
    )
  )
  INTO v_result
  FROM metrics m, cancelled_metrics cm, items_count ic;
  
  RETURN v_result;
END;
$function$;