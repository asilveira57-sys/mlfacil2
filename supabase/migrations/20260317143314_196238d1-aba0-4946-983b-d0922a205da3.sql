
-- Phase A: Add missing columns to shipping_cutoff_cache
ALTER TABLE public.shipping_cutoff_cache 
  ADD COLUMN IF NOT EXISTS agency_cutoff_source text,
  ADD COLUMN IF NOT EXISTS agency_handling_limit_time text;

-- Phase B: Replace get_shipping_orders with ML-parity logic
CREATE OR REPLACE FUNCTION public.get_shipping_orders(
  p_seller_id text,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_status_filter text DEFAULT 'all',
  p_search_query text DEFAULT '',
  p_page int DEFAULT 1,
  p_page_size int DEFAULT 50,
  p_sort_field text DEFAULT 'created_at_meli',
  p_sort_direction text DEFAULT 'desc',
  p_period_type text DEFAULT 'date_range'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      -- ML-PARITY: today_dispatch shows ALL shipments requiring seller action
      -- Includes: ready_to_ship, handling, pending with ANY handling_limit (even null/overdue/tomorrow)
      -- This matches ML's operational view which shows all active shipments needing attention
      AND (
        p_period_type != 'today_dispatch'
        OR (
          s.shipment_status IN ('ready_to_ship', 'handling', 'pending')
          AND s.shipment_status IS NOT NULL
          AND (
            -- Has handling limit: include if overdue, today, or tomorrow (operational window)
            (s.estimated_handling_limit IS NOT NULL AND s.estimated_handling_limit <= v_today_end + interval '1 day')
            OR
            -- No handling limit: still include if shipment is active (ML shows these too)
            (s.estimated_handling_limit IS NULL)
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
$$;
