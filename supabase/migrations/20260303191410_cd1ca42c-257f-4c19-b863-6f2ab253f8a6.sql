CREATE OR REPLACE FUNCTION public.get_cost_summary(p_seller_id text, p_user_id uuid, p_date_from timestamp with time zone, p_date_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'total_revenue', COALESCE(SUM(revenue_total), 0),
    'total_cost', COALESCE(SUM(cost_total), 0),
    'total_profit', COALESCE(SUM(profit_total), 0),
    'total_tax', COALESCE(SUM(tax_value), 0),
    'total_packaging', COALESCE(SUM(cost_packaging), 0),
    'total_cost_product', COALESCE(SUM(cost_items_total), 0),
    'total_cost_shipping', COALESCE(SUM(
      GREATEST(COALESCE(cost_shipping, 0), COALESCE(shipping_cost_seller, 0))
    ), 0),
    'total_cost_marketplace', COALESCE(SUM(
      CASE WHEN total_marketplace_cost IS NOT NULL AND total_marketplace_cost > 0 
           THEN total_marketplace_cost 
           ELSE GREATEST(COALESCE(cost_fees, 0), COALESCE(commission_cost, 0))
      END
    ), 0),
    'total_installments', COALESCE(SUM(installments_cost), 0),
    'total_cost_other', COALESCE(SUM(cost_other), 0),
    'total_receita_produtos', COALESCE(SUM(receita_produtos), 0),
    'total_receita_envio', COALESCE(SUM(receita_envio), 0),
    'avg_margin', CASE WHEN COUNT(*) > 0 THEN COALESCE(AVG(margin_percent), 0) ELSE 0 END,
    'order_count', COUNT(*),
    'incomplete_count', COUNT(*) FILTER (WHERE status = 'incompleto'),
    'incomplete_percent', CASE WHEN COUNT(*) > 0 
      THEN (COUNT(*) FILTER (WHERE status = 'incompleto'))::numeric / COUNT(*)::numeric * 100 
      ELSE 0 END,
    'missing_cost_count', COUNT(*) FILTER (WHERE COALESCE(missing_cost_items_count, 0) > 0)
  )
  FROM order_cost_breakdown_cache
  WHERE seller_id = p_seller_id
    AND user_id = p_user_id
    AND created_at_meli >= p_date_from
    AND created_at_meli <= p_date_to;
$function$;