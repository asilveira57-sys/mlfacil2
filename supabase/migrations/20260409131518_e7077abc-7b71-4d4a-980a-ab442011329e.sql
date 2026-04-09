
CREATE OR REPLACE FUNCTION public.get_shipping_orders(
  p_seller_id text,
  p_date_from timestamp with time zone DEFAULT NULL,
  p_date_to timestamp with time zone DEFAULT NULL,
  p_status_filter text DEFAULT 'all',
  p_search_query text DEFAULT '',
  p_sort_field text DEFAULT 'created_at_meli',
  p_sort_dir text DEFAULT 'desc',
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 30,
  p_period_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_offset INT;
  v_result JSONB;
  v_today DATE := CURRENT_DATE;
  v_yesterday DATE := CURRENT_DATE - 1;
BEGIN
  v_offset := (p_page - 1) * p_page_size;

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
        -- Completed statuses first (even for fulfillment)
        WHEN s.shipment_status IN ('delivered','shipped','not_delivered') THEN 'enviado'
        -- Fulfillment (only active ones reach here)
        WHEN s.logistic_type = 'fulfillment' THEN 'full'
        -- Printed = reprint
        WHEN s.shipment_substatus = 'printed' THEN 'reimprimir'
        -- Invoice pending
        WHEN s.shipment_substatus = 'invoice_pending' THEN 'aguardando_nf'
        -- Buffered = awaiting ML processing
        WHEN s.shipment_substatus = 'buffered' THEN 'aguardando_nf'
        -- Ready to print (standard)
        WHEN s.shipment_substatus = 'ready_to_print' AND COALESCE(s.label_available, false) THEN 'pronta'
        -- Cross-docking / coleta substatuses
        WHEN s.shipment_substatus = 'ready_for_pickup' THEN 'pronta'
        WHEN s.shipment_substatus = 'in_packing_list' THEN 'pronta'
        -- In hub = already in transit to hub
        WHEN s.shipment_substatus = 'in_hub' THEN 'reimprimir'
        ELSE 'outros'
      END AS final_status,
      CASE
        WHEN s.shipment_substatus = 'printed' THEN true
        WHEN s.shipment_substatus = 'ready_to_print' AND COALESCE(s.label_available, false) THEN true
        WHEN s.shipment_substatus IN ('ready_for_pickup', 'in_packing_list') THEN true
        ELSE false
      END AS selectable
    FROM meli_orders_cache o
    LEFT JOIN meli_shipments_cache s 
      ON s.shipment_id = o.shipment_id AND s.seller_id = o.seller_id
    LEFT JOIN meli_invoices_cache inv 
      ON inv.order_id = o.order_id AND inv.seller_id = o.seller_id
    WHERE o.seller_id = p_seller_id
      AND o.order_status NOT IN ('cancelled')
      -- Date filtering: either by period_type or explicit dates
      AND (
        CASE
          WHEN p_period_type = 'today_dispatch' THEN
            -- Show orders with handling_limit today or yesterday (if still active)
            (
              (s.estimated_handling_limit IS NOT NULL AND (
                s.estimated_handling_limit::date = v_today
                OR (s.estimated_handling_limit::date = v_yesterday AND s.shipment_status NOT IN ('delivered','shipped','not_delivered'))
              ))
              OR
              -- Also show active orders without handling_limit
              (s.estimated_handling_limit IS NULL AND s.shipment_status IN ('ready_to_ship','pending','handling') AND s.logistic_type != 'fulfillment')
            )
          ELSE
            -- Standard date range filtering
            (p_date_from IS NULL OR o.created_at_meli >= p_date_from)
            AND (p_date_to IS NULL OR o.created_at_meli <= p_date_to)
        END
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
      CASE WHEN p_sort_field = 'buyer_nickname' AND p_sort_dir = 'desc' THEN buyer_nickname END DESC NULLS LAST,
      CASE WHEN p_sort_field = 'buyer_nickname' AND p_sort_dir = 'asc' THEN buyer_nickname END ASC NULLS LAST,
      CASE WHEN p_sort_field = 'final_status' AND p_sort_dir = 'asc' THEN
        CASE final_status
          WHEN 'pronta' THEN 1
          WHEN 'aguardando_nf' THEN 2
          WHEN 'reimprimir' THEN 3
          WHEN 'pendente_sync' THEN 4
          WHEN 'full' THEN 5
          WHEN 'enviado' THEN 6
          ELSE 7
        END
      END ASC NULLS LAST,
      CASE WHEN p_sort_field = 'final_status' AND p_sort_dir = 'desc' THEN
        CASE final_status
          WHEN 'pronta' THEN 1
          WHEN 'aguardando_nf' THEN 2
          WHEN 'reimprimir' THEN 3
          WHEN 'pendente_sync' THEN 4
          WHEN 'full' THEN 5
          WHEN 'enviado' THEN 6
          ELSE 7
        END
      END DESC NULLS LAST,
      created_at_meli DESC NULLS LAST
    LIMIT p_page_size OFFSET v_offset
  ),
  rows AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'user_id', s.user_id,
        'seller_id', s.seller_id,
        'order_id', s.order_id,
        'created_at_meli', s.created_at_meli,
        'order_status', s.order_status,
        'shipment_id', s.shipment_id,
        'buyer_nickname', s.buyer_nickname,
        'total_amount', s.total_amount,
        'order_sync_at', s.order_sync_at,
        'shipment_status', s.shipment_status,
        'shipment_substatus', s.shipment_substatus,
        'tracking_number', s.tracking_number,
        'label_available', s.label_available,
        'receiver_name', s.receiver_name,
        'shipment_sync_at', s.shipment_sync_at,
        'logistic_type', s.logistic_type,
        'estimated_handling_limit', s.estimated_handling_limit,
        'invoice_status', s.invoice_status,
        'invoice_number', s.invoice_number,
        'invoice_key', s.invoice_key,
        'issued_at', s.issued_at,
        'invoice_sync_at', s.invoice_sync_at,
        'final_status', s.final_status,
        'selectable', s.selectable
      )
    ) AS data
    FROM sorted s
  )
  SELECT jsonb_build_object(
    'orders', COALESCE(r.data, '[]'::jsonb),
    'totalCount', t.total_count,
    'statusCounts', jsonb_build_object(
      'all', c.cnt_all,
      'pronta', c.cnt_pronta,
      'aguardando_nf', c.cnt_aguardando_nf,
      'reimprimir', c.cnt_reimprimir
    )
  ) INTO v_result
  FROM rows r, total t, counts c;

  RETURN v_result;
END;
$function$;
