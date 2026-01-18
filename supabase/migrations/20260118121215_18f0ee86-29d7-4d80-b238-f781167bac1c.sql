-- Function to get only orders that need cost sync (incremental mode)
CREATE OR REPLACE FUNCTION public.get_orders_needing_cost_sync(
  p_seller_id TEXT,
  p_limit INT DEFAULT 200,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  order_id TEXT,
  shipment_id TEXT,
  total_amount NUMERIC,
  created_at_meli TIMESTAMPTZ,
  current_fee_ml_source TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.order_id,
    o.shipment_id,
    o.total_amount,
    o.created_at_meli,
    b.fee_ml_source
  FROM meli_orders_cache o
  LEFT JOIN order_cost_breakdown_cache b 
    ON b.seller_id = o.seller_id AND b.order_id = o.order_id
  WHERE o.seller_id = p_seller_id
    AND o.order_status = 'paid'
    AND (
      b.order_id IS NULL  -- no breakdown yet
      OR b.fee_ml_source = 'pending'  -- pending billing data
    )
  ORDER BY o.created_at_meli ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Function to count orders needing sync
CREATE OR REPLACE FUNCTION public.count_orders_needing_cost_sync(p_seller_id TEXT)
RETURNS TABLE (
  total_pending BIGINT,
  no_breakdown BIGINT,
  pending_billing BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
    AND (
      b.order_id IS NULL
      OR b.fee_ml_source = 'pending'
    );
END;
$$;