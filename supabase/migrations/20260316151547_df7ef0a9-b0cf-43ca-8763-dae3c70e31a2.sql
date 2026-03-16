
-- 1. Add agency_cutoff_time column to shipping_cutoff_cache
ALTER TABLE shipping_cutoff_cache ADD COLUMN IF NOT EXISTS agency_cutoff_time TEXT;

-- 2. Fix get_shipping_orders: today_dispatch strictly shows only today's actionable orders
CREATE OR REPLACE FUNCTION public.get_shipping_orders(
  p_seller_id TEXT,
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL,
  p_status_filter TEXT DEFAULT 'all',
  p_search_query TEXT DEFAULT '',
  p_sort_field TEXT DEFAULT 'created_at_meli',
  p_sort_dir TEXT DEFAULT 'desc',
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 30,
  p_period_type TEXT DEFAULT 'date_range'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_offset INT;
  v_result JSONB;
  v_today_start TIMESTAMPTZ;
  v_today_end TIMESTAMPTZ;
BEGIN
  v_offset := (p_page - 1) * p_page_size;
  
  -- Calculate today boundaries in Sao Paulo timezone
  v_today_start := (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo'))::date::timestamptz;
  v_today_end := v_today_start + interval '1 day';

  WITH base_orders AS (
    SELECT
      o.id,
      o.user_id,
      o.seller_id,
      o.order_id,
      o.created_at_meli,
      o.order_status,
      o.shipment_id,
      o.buyer_nickname,
      o.total_amount,
      o.last_sync_at AS order_sync_at,
      s.shipment_status,
      s.shipment_substatus,
      s.tracking_number,
      COALESCE(s.label_available, false) AS label_available,
      s.receiver_name,
      s.last_sync_at AS shipment_sync_at,
      s.logistic_type,
      s.estimated_handling_limit,
      COALESCE(inv.invoice_status, 'pendente') AS invoice_status,
      inv.invoice_number,
      inv.invoice_key,
      inv.issued_at,
      inv.last_sync_at AS invoice_sync_at,
      CASE
        WHEN s.shipment_id IS NULL AND o.shipment_id IS NOT NULL THEN 'pendente_sync'
        WHEN o.shipment_id IS NULL THEN 'outros'
        -- Terminal statuses FIRST
        WHEN s.shipment_status IN ('delivered','not_delivered') THEN 'enviado'
        WHEN s.shipment_status = 'shipped' THEN 'enviado'
        -- Fulfillment still in processing
        WHEN s.logistic_type IN ('fulfillment','cross_docking')
             AND s.shipment_status IN ('ready_to_ship','handling','pending') THEN 'full'
        -- Seller operational statuses
        WHEN s.shipment_substatus = 'printed' THEN 'reimprimir'
        WHEN s.shipment_substatus = 'invoice_pending' THEN 'aguardando_nf'
        WHEN s.shipment_substatus = 'ready_to_print'
             AND COALESCE(s.label_available, false) THEN 'pronta'
        ELSE 'outros'
      END AS final_status,
      CASE
        WHEN s.shipment_substatus = 'printed' THEN true
        WHEN s.shipment_substatus = 'ready_to_print' AND COALESCE(s.label_available, false) THEN true
        ELSE false
      END AS selectable
    FROM meli_orders_cache o
    LEFT JOIN meli_shipments_cache s
      ON s.shipment_id = o.shipment_id AND s.seller_id = o.seller_id
    LEFT JOIN meli_invoices_cache inv
      ON inv.order_id = o.order_id AND inv.seller_id = o.seller_id
    WHERE o.seller_id = p_seller_id
      AND o.order_status NOT IN ('cancelled')
      -- Date range filter (only when period_type = 'date_range')
      AND (
        p_period_type = 'today_dispatch'
        OR (p_date_from IS NULL OR o.created_at_meli >= p_date_from)
      )
      AND (
        p_period_type = 'today_dispatch'
        OR (p_date_to IS NULL OR o.created_at_meli <= p_date_to)
      )
      -- FIXED: today_dispatch shows ONLY shipments requiring seller action TODAY
      -- Requires: active shipment status + handling_limit within today or overdue
      -- Excludes: tomorrow's deadlines, delivered/shipped, orders without shipment data
      AND (
        p_period_type != 'today_dispatch'
        OR (
          s.shipment_status IN ('ready_to_ship', 'handling')
          AND (
            -- Has handling limit within today (includes overdue from previous days)
            (s.estimated_handling_limit IS NOT NULL AND s.estimated_handling_limit <= v_today_end)
            OR
            -- Fallback: active shipment without handling limit, created today
            (s.estimated_handling_limit IS NULL AND o.created_at_meli >= v_today_start)
          )
        )
      )
  ),
  deduped AS (
    SELECT DISTINCT ON (COALESCE(shipment_id, order_id))
      *
    FROM base_orders
    ORDER BY
      COALESCE(shipment_id, order_id),
      CASE final_status
        WHEN 'pronta' THEN 1
        WHEN 'aguardando_nf' THEN 2
        WHEN 'reimprimir' THEN 3
        WHEN 'pendente_sync' THEN 4
        WHEN 'full' THEN 5
        WHEN 'enviado' THEN 6
        ELSE 7
      END ASC
  ),
  searched AS (
    SELECT * FROM deduped
    WHERE p_search_query = '' OR (
      order_id ILIKE '%' || p_search_query || '%'
      OR buyer_nickname ILIKE '%' || p_search_query || '%'
      OR shipment_id ILIKE '%' || p_search_query || '%'
      OR receiver_name ILIKE '%' || p_search_query || '%'
    )
  ),
  counts AS (
    SELECT
      COUNT(*) AS cnt_all,
      COUNT(*) FILTER (WHERE final_status = 'pronta') AS cnt_pronta,
      COUNT(*) FILTER (WHERE final_status = 'aguardando_nf') AS cnt_aguardando_nf,
      COUNT(*) FILTER (WHERE final_status = 'reimprimir') AS cnt_reimprimir
    FROM searched
  ),
  filtered AS (
    SELECT * FROM searched
    WHERE p_status_filter = 'all' OR final_status = p_status_filter
  ),
  total AS (
    SELECT COUNT(*) AS total_count FROM filtered
  ),
  sorted AS (
    SELECT * FROM filtered
    ORDER BY
      CASE WHEN p_sort_field = 'created_at_meli' AND p_sort_dir = 'desc' THEN created_at_meli END DESC NULLS LAST,
      CASE WHEN p_sort_field = 'created_at_meli' AND p_sort_dir = 'asc' THEN created_at_meli END ASC NULLS LAST,
      CASE WHEN p_sort_field = 'order_id' AND p_sort_dir = 'desc' THEN order_id END DESC NULLS LAST,
      CASE WHEN p_sort_field = 'order_id' AND p_sort_dir = 'asc' THEN order_id END ASC NULLS LAST,
      CASE WHEN p_sort_field = 'buyer_nickname' AND p_sort_dir = 'desc' THEN buyer_nickname END DESC NULLS LAST,
      CASE WHEN p_sort_field = 'buyer_nickname' AND p_sort_dir = 'asc' THEN buyer_nickname END ASC NULLS LAST,
      CASE WHEN p_sort_field = 'total_amount' AND p_sort_dir = 'desc' THEN total_amount END DESC NULLS LAST,
      CASE WHEN p_sort_field = 'total_amount' AND p_sort_dir = 'asc' THEN total_amount END ASC NULLS LAST,
      created_at_meli DESC NULLS LAST
    LIMIT p_page_size OFFSET v_offset
  )
  SELECT jsonb_build_object(
    'orders', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', s.id,
      'user_id', s.user_id,
      'seller_id', s.seller_id,
      'order_id', s.order_id,
      'created_at_meli', s.created_at_meli,
      'order_status', s.order_status,
      'shipment_id', s.shipment_id,
      'buyer_nickname', s.buyer_nickname,
      'total_amount', s.total_amount,
      'shipment_status', s.shipment_status,
      'shipment_substatus', s.shipment_substatus,
      'tracking_number', s.tracking_number,
      'label_available', s.label_available,
      'receiver_name', s.receiver_name,
      'logistic_type', s.logistic_type,
      'estimated_handling_limit', s.estimated_handling_limit,
      'invoice_status', s.invoice_status,
      'invoice_number', s.invoice_number,
      'invoice_key', s.invoice_key,
      'final_status', s.final_status,
      'selectable', s.selectable
    )) FROM sorted s), '[]'::jsonb),
    'total_count', (SELECT total_count FROM total),
    'status_counts', (SELECT jsonb_build_object(
      'all', cnt_all,
      'pronta', cnt_pronta,
      'aguardando_nf', cnt_aguardando_nf,
      'reimprimir', cnt_reimprimir
    ) FROM counts)
  )
  INTO v_result;

  RETURN v_result;
END;
$function$;

-- Audit log
INSERT INTO public.system_logs (level, system_area, action, success, message, meta_json)
VALUES (
  'info',
  'shipping_labels',
  'fix_today_dispatch_strict_and_agency_cutoff',
  true,
  'Fixed today_dispatch to strictly show only today''s actionable orders (removed +1 day extension). Added agency_cutoff_time column to shipping_cutoff_cache for proper logistic type separation.',
  '{"changes": ["get_shipping_orders: removed +1 day extension, now strictly <= v_today_end", "get_shipping_orders: requires active shipment status (ready_to_ship/handling)", "get_shipping_orders: null handling_limit fallback restricted to orders created today", "shipping_cutoff_cache: added agency_cutoff_time column"]}'::jsonb
);
