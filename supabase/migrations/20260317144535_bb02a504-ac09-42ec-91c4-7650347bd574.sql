CREATE OR REPLACE FUNCTION public.get_shipping_orders(
  p_seller_id text,
  p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_status_filter text DEFAULT 'all'::text,
  p_search_query text DEFAULT ''::text,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50,
  p_sort_field text DEFAULT 'created_at_meli'::text,
  p_sort_direction text DEFAULT 'desc'::text,
  p_period_type text DEFAULT 'date_range'::text
)
RETURNS jsonb
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

  -- São Paulo day boundaries converted to timestamptz (UTC-safe)
  v_today_start := (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo');
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
        WHEN s.shipment_status IN ('delivered','not_delivered') THEN 'enviado'
        WHEN s.shipment_status = 'shipped' THEN 'enviado'
        WHEN s.logistic_type IN ('fulfillment','cross_docking')
             AND s.shipment_status IN ('ready_to_ship','handling','pending') THEN 'full'
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
      AND (
        (
          p_period_type = 'today_dispatch'
          AND s.shipment_status IN ('ready_to_ship', 'handling', 'pending')
          AND s.shipment_status IS NOT NULL
          AND (
            s.estimated_handling_limit IS NULL
            OR s.estimated_handling_limit <= v_today_end + interval '1 day'
          )
        )
        OR (
          p_period_type <> 'today_dispatch'
          AND (
            (
              (p_date_from IS NULL OR o.created_at_meli >= p_date_from)
              AND (p_date_to IS NULL OR o.created_at_meli <= p_date_to)
            )
            OR (
              p_period_type = 'date_range'
              AND s.shipment_status IN ('ready_to_ship','handling','pending')
              AND s.shipment_substatus IN ('ready_to_print','printed','invoice_pending')
            )
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
      COUNT(*) FILTER (WHERE final_status = 'reimprimir') AS cnt_reimprimir,
      COUNT(*) FILTER (WHERE final_status = 'full') AS cnt_full,
      COUNT(*) FILTER (WHERE final_status = 'enviado') AS cnt_enviado,
      COUNT(*) FILTER (WHERE final_status = 'outros') AS cnt_outros,
      COUNT(*) FILTER (WHERE final_status = 'pendente_sync') AS cnt_pendente_sync
    FROM searched
  ),
  status_filtered AS (
    SELECT * FROM searched
    WHERE p_status_filter = 'all' OR final_status = p_status_filter
  ),
  total AS (
    SELECT COUNT(*) AS total_count FROM status_filtered
  ),
  sorted AS (
    SELECT * FROM status_filtered
    ORDER BY
      CASE WHEN p_sort_field = 'created_at_meli' AND p_sort_direction = 'desc' THEN created_at_meli END DESC NULLS LAST,
      CASE WHEN p_sort_field = 'created_at_meli' AND p_sort_direction = 'asc' THEN created_at_meli END ASC NULLS LAST,
      CASE WHEN p_sort_field = 'buyer_nickname' AND p_sort_direction = 'desc' THEN buyer_nickname END DESC NULLS LAST,
      CASE WHEN p_sort_field = 'buyer_nickname' AND p_sort_direction = 'asc' THEN buyer_nickname END ASC NULLS LAST,
      CASE WHEN p_sort_field = 'final_status' AND p_sort_direction = 'desc' THEN final_status END DESC NULLS LAST,
      CASE WHEN p_sort_field = 'final_status' AND p_sort_direction = 'asc' THEN final_status END ASC NULLS LAST
    LIMIT p_page_size OFFSET v_offset
  )
  SELECT jsonb_build_object(
    'orders', COALESCE((SELECT jsonb_agg(row_to_json(sorted.*)) FROM sorted), '[]'::jsonb),
    'totalCount', (SELECT total_count FROM total),
    'statusCounts', (SELECT jsonb_build_object(
      'all', cnt_all, 'pronta', cnt_pronta, 'aguardando_nf', cnt_aguardando_nf,
      'reimprimir', cnt_reimprimir, 'full', cnt_full, 'enviado', cnt_enviado,
      'outros', cnt_outros, 'pendente_sync', cnt_pendente_sync
    ) FROM counts)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_shipping_orders(
  p_seller_id text,
  p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_status_filter text DEFAULT 'all'::text,
  p_search_query text DEFAULT ''::text,
  p_sort_field text DEFAULT 'created_at_meli'::text,
  p_sort_dir text DEFAULT 'desc'::text,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 30,
  p_period_type text DEFAULT 'date_range'::text
)
RETURNS jsonb
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

  -- São Paulo day boundaries converted to timestamptz (UTC-safe)
  v_today_start := (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo');
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
        WHEN s.shipment_status IN ('delivered','not_delivered') THEN 'enviado'
        WHEN s.shipment_status = 'shipped' THEN 'enviado'
        WHEN s.logistic_type IN ('fulfillment','cross_docking')
             AND s.shipment_status IN ('ready_to_ship','handling','pending') THEN 'full'
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
      AND (
        (
          p_period_type = 'today_dispatch'
          AND s.shipment_status IN ('ready_to_ship', 'handling', 'pending')
          AND s.shipment_status IS NOT NULL
          AND (
            s.estimated_handling_limit IS NULL
            OR s.estimated_handling_limit <= v_today_end + interval '1 day'
          )
        )
        OR (
          p_period_type <> 'today_dispatch'
          AND (
            (
              (p_date_from IS NULL OR o.created_at_meli >= p_date_from)
              AND (p_date_to IS NULL OR o.created_at_meli <= p_date_to)
            )
            OR (
              p_period_type = 'date_range'
              AND s.shipment_status IN ('ready_to_ship','handling','pending')
              AND s.shipment_substatus IN ('ready_to_print','printed','invoice_pending')
            )
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