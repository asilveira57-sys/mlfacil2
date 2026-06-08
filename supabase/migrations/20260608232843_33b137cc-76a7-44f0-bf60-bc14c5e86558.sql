
CREATE OR REPLACE FUNCTION public.get_shipping_orders(
  p_seller_id text,
  p_date_from timestamp with time zone DEFAULT NULL,
  p_date_to   timestamp with time zone DEFAULT NULL,
  p_status_filter text DEFAULT 'all',
  p_search_query  text DEFAULT '',
  p_sort_field    text DEFAULT 'created_at_meli',
  p_sort_dir      text DEFAULT 'desc',
  p_page          integer DEFAULT 1,
  p_page_size     integer DEFAULT 30,
  p_period_type   text DEFAULT 'date_range'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_offset INT;
  v_result JSONB;
  v_today  DATE;
BEGIN
  v_offset := (p_page - 1) * p_page_size;
  v_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  WITH base_orders AS (
    SELECT
      o.id, o.user_id, o.seller_id, o.order_id, o.pack_id, o.created_at_meli,
      o.order_status, o.shipment_id, o.buyer_nickname, o.total_amount,
      o.last_sync_at AS order_sync_at,
      s.shipment_status, s.shipment_substatus, s.tracking_number,
      COALESCE(s.label_available, false) AS label_available,
      s.receiver_name, s.last_sync_at AS shipment_sync_at, s.logistic_type,
      s.estimated_handling_limit, s.estimated_schedule_limit,
      COALESCE(s.estimated_schedule_limit, s.estimated_handling_limit) AS effective_cutoff,
      COALESCE(inv.invoice_status, 'pendente') AS invoice_status,
      inv.invoice_number, inv.invoice_key, inv.issued_at,
      inv.last_sync_at AS invoice_sync_at,
      CASE
        WHEN s.shipment_substatus IN ('buffered','scheduled') THEN true
        WHEN COALESCE(s.estimated_schedule_limit, s.estimated_handling_limit) IS NOT NULL
             AND (COALESCE(s.estimated_schedule_limit, s.estimated_handling_limit) AT TIME ZONE 'America/Sao_Paulo')::date > v_today
             AND COALESCE(s.label_available,false) = false
          THEN true
        ELSE false
      END AS is_scheduled,
      CASE
        WHEN s.shipment_id IS NULL AND o.shipment_id IS NOT NULL THEN 'pendente_sync'
        WHEN o.shipment_id IS NULL THEN 'outros'
        WHEN s.shipment_status IN ('delivered','not_delivered') THEN 'enviado'
        WHEN s.shipment_status = 'shipped' THEN 'enviado'
        WHEN s.shipment_substatus IN ('in_hub','dropped_off') THEN 'enviado'
        WHEN s.logistic_type = 'fulfillment' THEN 'full'
        WHEN s.shipment_substatus IN ('buffered','scheduled') THEN 'agendada'
        WHEN COALESCE(s.estimated_schedule_limit, s.estimated_handling_limit) IS NOT NULL
             AND (COALESCE(s.estimated_schedule_limit, s.estimated_handling_limit) AT TIME ZONE 'America/Sao_Paulo')::date > v_today
             AND COALESCE(s.label_available,false) = false
          THEN 'agendada'
        WHEN (
          s.logistic_type IS DISTINCT FROM 'self_service'
          AND s.shipment_status IN ('ready_to_ship','handling','pending')
          AND (
            s.shipment_substatus = 'invoice_pending'
            OR (
              COALESCE(inv.invoice_status,'pendente') <> 'emitida'
              AND COALESCE(s.shipment_substatus,'') NOT IN (
                'invoice_issued','invoice_validated','not_required',
                'ready_to_print','printed','ready_for_pickup','in_packing_list'
              )
            )
          )
        ) THEN 'aguardando_nf'
        WHEN (
          COALESCE(s.label_available,false)
          AND s.shipment_status IN ('ready_to_ship','handling','pending')
          AND s.shipment_substatus IN ('printed','ready_for_pickup','in_packing_list')
        ) THEN 'pronta_enviar'
        WHEN (
          COALESCE(s.label_available,false)
          AND s.shipment_status IN ('ready_to_ship','handling','pending')
          AND (
            s.logistic_type = 'self_service'
            OR COALESCE(inv.invoice_status,'pendente') = 'emitida'
            OR s.shipment_substatus IN ('ready_to_print','invoice_issued','invoice_validated','not_required')
          )
        ) THEN 'para_imprimir'
        ELSE 'outros'
      END AS final_status,
      CASE
        WHEN COALESCE(s.label_available,false)
             AND s.shipment_status IN ('ready_to_ship','handling','pending')
             AND s.shipment_substatus IN ('printed','ready_for_pickup','in_packing_list')
          THEN true
        ELSE false
      END AS is_reprint,
      CASE
        WHEN COALESCE(s.label_available,false)
             AND s.shipment_status IN ('ready_to_ship','handling','pending')
             AND (
               s.logistic_type = 'self_service'
               OR COALESCE(inv.invoice_status,'pendente') = 'emitida'
               OR s.shipment_substatus IN (
                 'ready_to_print','printed',
                 'invoice_issued','invoice_validated','not_required',
                 'ready_for_pickup','in_packing_list'
               )
             )
          THEN true
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
            s.shipment_id IS NOT NULL
            AND s.logistic_type IS DISTINCT FROM 'fulfillment'
            AND s.shipment_status IN ('ready_to_ship','handling','pending')
            AND COALESCE(s.shipment_substatus,'') NOT IN ('in_hub','dropped_off','buffered','scheduled')
            AND (
              COALESCE(s.estimated_schedule_limit, s.estimated_handling_limit) IS NULL
              OR (COALESCE(s.estimated_schedule_limit, s.estimated_handling_limit) AT TIME ZONE 'America/Sao_Paulo')::date <= v_today
            )
            AND (
              (
                COALESCE(s.estimated_schedule_limit, s.estimated_handling_limit) IS NOT NULL
                AND (COALESCE(s.estimated_schedule_limit, s.estimated_handling_limit) AT TIME ZONE 'America/Sao_Paulo')::date <= v_today
              )
              OR (
                COALESCE(s.estimated_schedule_limit, s.estimated_handling_limit) IS NULL
                AND (
                  COALESCE(s.label_available,false)
                  OR s.shipment_substatus = 'invoice_pending'
                  OR COALESCE(inv.invoice_status,'pendente') <> 'emitida'
                )
              )
            )
          ELSE
            (p_date_from IS NULL OR o.created_at_meli >= p_date_from)
            AND (p_date_to   IS NULL OR o.created_at_meli <= p_date_to)
        END
      )
  ),
  deduped AS (
    SELECT DISTINCT ON (COALESCE(shipment_id, order_id)) *
    FROM base_orders
    ORDER BY
      COALESCE(shipment_id, order_id),
      CASE final_status
        WHEN 'pronta_enviar' THEN 1
        WHEN 'para_imprimir' THEN 2
        WHEN 'aguardando_nf' THEN 3
        WHEN 'agendada' THEN 4
        WHEN 'pendente_sync' THEN 5
        WHEN 'full' THEN 6
        WHEN 'enviado' THEN 7
        ELSE 8
      END ASC
  ),
  operational AS (
    SELECT * FROM deduped
    WHERE
      (p_period_type <> 'today_dispatch'
       OR final_status IN ('aguardando_nf','para_imprimir','pronta_enviar'))
  ),
  -- Universo SEM filtro operacional, apenas para contagem de "Agendadas".
  -- Agendadas sempre são visíveis no chip, mesmo em "Envios de hoje".
  agendadas_universe AS (
    SELECT DISTINCT ON (COALESCE(s.shipment_id, o.order_id))
      COALESCE(s.shipment_id, o.order_id) AS key
    FROM meli_orders_cache o
    LEFT JOIN meli_shipments_cache s
      ON s.shipment_id = o.shipment_id AND s.seller_id = o.seller_id
    LEFT JOIN meli_invoices_cache inv
      ON inv.order_id = o.order_id AND inv.seller_id = o.seller_id
    WHERE o.seller_id = p_seller_id
      AND o.order_status NOT IN ('cancelled')
      AND (
        s.shipment_substatus IN ('buffered','scheduled')
        OR (
          COALESCE(s.estimated_schedule_limit, s.estimated_handling_limit) IS NOT NULL
          AND (COALESCE(s.estimated_schedule_limit, s.estimated_handling_limit) AT TIME ZONE 'America/Sao_Paulo')::date > v_today
          AND COALESCE(s.label_available,false) = false
        )
      )
      AND s.logistic_type IS DISTINCT FROM 'fulfillment'
      AND s.shipment_status NOT IN ('delivered','not_delivered','shipped')
      AND COALESCE(s.shipment_substatus,'') NOT IN ('in_hub','dropped_off')
      AND (p_search_query = '' OR (
        o.order_id ILIKE '%' || p_search_query || '%'
        OR o.pack_id ILIKE '%' || p_search_query || '%'
        OR o.buyer_nickname ILIKE '%' || p_search_query || '%'
        OR s.shipment_id ILIKE '%' || p_search_query || '%'
        OR s.receiver_name ILIKE '%' || p_search_query || '%'
      ))
  ),
  searched AS (
    SELECT * FROM operational
    WHERE p_search_query = '' OR (
      order_id       ILIKE '%' || p_search_query || '%'
      OR pack_id     ILIKE '%' || p_search_query || '%'
      OR buyer_nickname ILIKE '%' || p_search_query || '%'
      OR shipment_id ILIKE '%' || p_search_query || '%'
      OR receiver_name ILIKE '%' || p_search_query || '%'
    )
  ),
  counts AS (
    SELECT
      COUNT(*) FILTER (WHERE final_status IN ('aguardando_nf','para_imprimir','pronta_enviar')) AS cnt_all,
      COUNT(*) FILTER (WHERE final_status = 'aguardando_nf') AS cnt_aguardando_nf,
      COUNT(*) FILTER (WHERE final_status = 'para_imprimir') AS cnt_para_imprimir,
      COUNT(*) FILTER (WHERE final_status = 'pronta_enviar') AS cnt_pronta_enviar,
      COUNT(*) FILTER (WHERE is_reprint AND final_status IN ('para_imprimir','pronta_enviar')) AS cnt_reimprimir
    FROM searched
  ),
  agendadas_count AS (
    SELECT COUNT(*) AS cnt FROM agendadas_universe
  ),
  filtered AS (
    SELECT * FROM searched
    WHERE
      CASE
        WHEN p_status_filter IN ('all','') THEN
          final_status IN ('aguardando_nf','para_imprimir','pronta_enviar')
        WHEN p_status_filter = 'reimprimir' THEN
          is_reprint AND final_status IN ('para_imprimir','pronta_enviar')
        WHEN p_status_filter = 'pronta' THEN
          final_status IN ('para_imprimir','pronta_enviar')
        WHEN p_status_filter = 'agendada' THEN
          final_status = 'agendada'
        ELSE
          final_status = p_status_filter
      END
  ),
  total AS (
    SELECT COUNT(*) AS total_count FROM filtered
  ),
  sorted AS (
    SELECT * FROM filtered
    ORDER BY
      CASE WHEN p_sort_field='created_at_meli' AND p_sort_dir='desc' THEN created_at_meli END DESC NULLS LAST,
      CASE WHEN p_sort_field='created_at_meli' AND p_sort_dir='asc'  THEN created_at_meli END ASC  NULLS LAST,
      CASE WHEN p_sort_field='buyer_nickname'  AND p_sort_dir='desc' THEN buyer_nickname END DESC NULLS LAST,
      CASE WHEN p_sort_field='buyer_nickname'  AND p_sort_dir='asc'  THEN buyer_nickname END ASC  NULLS LAST,
      CASE WHEN p_sort_field='final_status' AND p_sort_dir='asc' THEN
        CASE final_status
          WHEN 'pronta_enviar' THEN 1 WHEN 'para_imprimir' THEN 2
          WHEN 'aguardando_nf' THEN 3 WHEN 'agendada' THEN 4
          WHEN 'pendente_sync' THEN 5 WHEN 'full' THEN 6
          WHEN 'enviado' THEN 7 ELSE 8 END
      END ASC NULLS LAST,
      CASE WHEN p_sort_field='final_status' AND p_sort_dir='desc' THEN
        CASE final_status
          WHEN 'pronta_enviar' THEN 1 WHEN 'para_imprimir' THEN 2
          WHEN 'aguardando_nf' THEN 3 WHEN 'agendada' THEN 4
          WHEN 'pendente_sync' THEN 5 WHEN 'full' THEN 6
          WHEN 'enviado' THEN 7 ELSE 8 END
      END DESC NULLS LAST
    LIMIT p_page_size OFFSET v_offset
  )
  SELECT
    jsonb_build_object(
      'orders', COALESCE((SELECT jsonb_agg(row_to_json(sorted.*)) FROM sorted), '[]'::jsonb),
      'total_count', (SELECT total_count FROM total),
      'status_counts', jsonb_build_object(
        'all',           (SELECT cnt_all FROM counts),
        'aguardando_nf', (SELECT cnt_aguardando_nf FROM counts),
        'para_imprimir', (SELECT cnt_para_imprimir FROM counts),
        'pronta_enviar', (SELECT cnt_pronta_enviar FROM counts),
        'pronta',        (SELECT cnt_para_imprimir + cnt_pronta_enviar FROM counts),
        'agendadas',     (SELECT cnt FROM agendadas_count),
        'reimprimir',    (SELECT cnt_reimprimir FROM counts)
      )
    )
  INTO v_result;

  RETURN v_result;
END;
$function$;
