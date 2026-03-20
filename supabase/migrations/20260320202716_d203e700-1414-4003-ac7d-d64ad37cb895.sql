
CREATE OR REPLACE FUNCTION get_item_metrics_by_period(
  p_seller_id text,
  p_days integer DEFAULT 30
)
RETURNS TABLE(
  item_id text,
  visits_period bigint,
  sales_period bigint,
  units_period bigint,
  conversion_period numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH visit_agg AS (
    SELECT
      sv.item_id,
      COALESCE(SUM(sv.visits_count), 0)::bigint AS visits_period
    FROM seller_item_visits sv
    WHERE sv.seller_id = p_seller_id
      AND sv.visit_date::date >= (CURRENT_DATE - p_days)
    GROUP BY sv.item_id
  ),
  sales_agg AS (
    SELECT
      oi.item_id,
      COUNT(DISTINCT oi.order_id)::bigint AS sales_period,
      COALESCE(SUM(oi.quantity), 0)::bigint AS units_period
    FROM meli_order_items_cache oi
    JOIN meli_orders_cache oc ON oc.order_id = oi.order_id AND oc.seller_id = oi.seller_id
    WHERE oi.seller_id = p_seller_id
      AND oc.created_at_meli >= (NOW() - (p_days || ' days')::interval)
      AND oi.quantity > 0
    GROUP BY oi.item_id
  )
  SELECT
    COALESCE(v.item_id, s.item_id) AS item_id,
    COALESCE(v.visits_period, 0)::bigint AS visits_period,
    COALESCE(s.sales_period, 0)::bigint AS sales_period,
    COALESCE(s.units_period, 0)::bigint AS units_period,
    CASE 
      WHEN COALESCE(v.visits_period, 0) > 0 
      THEN ROUND((COALESCE(s.sales_period, 0)::numeric / v.visits_period) * 100, 2)
      ELSE NULL
    END AS conversion_period
  FROM visit_agg v
  FULL OUTER JOIN sales_agg s ON v.item_id = s.item_id;
$$;

CREATE OR REPLACE FUNCTION get_item_visit_series(
  p_seller_id text,
  p_item_id text,
  p_days integer DEFAULT 30
)
RETURNS TABLE(
  visit_date date,
  visits bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH date_series AS (
    SELECT generate_series(
      CURRENT_DATE - p_days,
      CURRENT_DATE,
      '1 day'::interval
    )::date AS d
  )
  SELECT
    ds.d AS visit_date,
    COALESCE(sv.visits_count, 0)::bigint AS visits
  FROM date_series ds
  LEFT JOIN seller_item_visits sv
    ON sv.visit_date::date = ds.d
    AND sv.item_id = p_item_id
    AND sv.seller_id = p_seller_id
  ORDER BY ds.d ASC;
$$;
