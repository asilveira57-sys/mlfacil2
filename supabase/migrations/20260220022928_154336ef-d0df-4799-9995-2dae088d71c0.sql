
-- RPC function to get global total revenue (sum of all paid orders)
CREATE OR REPLACE FUNCTION public.get_global_total_revenue()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE(SUM(total_amount), 0)::numeric
  FROM public.meli_orders_cache
  WHERE order_status = 'paid';
$$;

-- RPC function to get global ADS metrics
CREATE OR REPLACE FUNCTION public.get_global_ads_metrics()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT jsonb_build_object(
    'total_spend', COALESCE(SUM(spent), 0),
    'total_revenue', COALESCE(SUM(revenue), 0),
    'avg_roas', CASE WHEN COALESCE(SUM(spent), 0) > 0 
      THEN ROUND((COALESCE(SUM(revenue), 0) / SUM(spent))::numeric, 4)
      ELSE 0 END,
    'avg_acos', CASE WHEN COALESCE(SUM(revenue), 0) > 0 
      THEN ROUND((COALESCE(SUM(spent), 0) / SUM(revenue) * 100)::numeric, 4)
      ELSE 0 END
  )
  FROM public.ads_daily_metrics;
$$;
