
-- Etapa 1: Add estimated_handling_limit column
ALTER TABLE public.meli_shipments_cache 
  ADD COLUMN IF NOT EXISTS estimated_handling_limit TIMESTAMPTZ;

-- Index for today_dispatch filter
CREATE INDEX IF NOT EXISTS idx_shipments_handling_limit 
  ON public.meli_shipments_cache(seller_id, estimated_handling_limit) 
  WHERE shipment_status IN ('ready_to_ship','handling','pending');

-- Etapa 3: Fix get_shipping_orders RPC - correct final_status logic + today_dispatch filter
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
  p_period_type text DEFAULT 'date_range'
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

  -- Calculate today boundaries in Brasilia timezone for today_dispatch mode
  IF p_period_type = 'today_dispatch' THEN
    v_today_start := (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')) AT TIME ZONE 'America/Sao_Paulo';
    v_today_end := v_today_start + INTERVAL '1 day';
  END IF;

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
        -- No shipment data yet
        WHEN s.shipment_id IS NULL AND o.shipment_id IS NOT NULL THEN 'pendente_sync'
        WHEN o.shipment_id IS NULL THEN 'outros'
        -- Terminal statuses FIRST (regardless of logistic_type)
        WHEN s.shipment_status IN ('delivered','not_delivered') THEN 'enviado'
        WHEN s.shipment_status = 'shipped' THEN 'enviado'
        -- Fulfillment still in process
        WHEN s.logistic_type IN ('fulfillment','cross_docking') 
             AND s.shipment_status IN ('ready_to_ship','handling','pending') THEN 'full'
        -- Seller operational statuses
        WHEN s.shipment_substatus = 'printed' THEN 'reimprimir'
        WHEN s.shipment_substatus = 'invoice_pending' THEN 'aguardando_nf'
        WHEN s.shipment_substatus = 'ready_to_print' AND COALESCE(s.label_available, false) THEN 'pronta'
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
        CASE 
          WHEN p_period_type = 'today_dispatch' THEN
            s.estimated_handling_limit IS NOT NULL 
            AND s.estimated_handling_limit >= v_today_start 
            AND s.estimated_handling_limit < v_today_end
          ELSE
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
        CASE final_status WHEN 'pronta' THEN 1 WHEN 'aguardando_nf' THEN 2 WHEN 'reimprimir' THEN 3 WHEN 'pendente_sync' THEN 4 WHEN 'full' THEN 5 WHEN 'enviado' THEN 6 ELSE 7 END
      END ASC NULLS LAST,
      CASE WHEN p_sort_field = 'final_status' AND p_sort_dir = 'desc' THEN
        CASE final_status WHEN 'pronta' THEN 1 WHEN 'aguardando_nf' THEN 2 WHEN 'reimprimir' THEN 3 WHEN 'pendente_sync' THEN 4 WHEN 'full' THEN 5 WHEN 'enviado' THEN 6 ELSE 7 END
      END DESC NULLS LAST
    LIMIT p_page_size OFFSET v_offset
  )
  SELECT 
    jsonb_build_object(
      'orders', COALESCE((SELECT jsonb_agg(row_to_json(sorted.*)) FROM sorted), '[]'::jsonb),
      'total_count', (SELECT total_count FROM total),
      'status_counts', jsonb_build_object(
        'all', (SELECT cnt_all FROM counts),
        'pronta', (SELECT cnt_pronta FROM counts),
        'aguardando_nf', (SELECT cnt_aguardando_nf FROM counts),
        'reimprimir', (SELECT cnt_reimprimir FROM counts)
      )
    )
  INTO v_result;

  RETURN v_result;
END;
$function$;
