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
  v_today DATE;
  v_yesterday DATE;
BEGIN
  v_offset := (p_page - 1) * p_page_size;
  v_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_yesterday := v_today - INTERVAL '1 day';

  WITH base_orders AS (
    SELECT
      o.id,
      o.user_id,
      o.seller_id,
      o.order_id,
      o.pack_id,
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
      s.estimated_schedule_limit,
      COALESCE(s.estimated_schedule_limit, s.estimated_handling_limit) AS effective_cutoff,
      COALESCE(inv.invoice_status, 'pendente') AS invoice_status,
      inv.invoice_number,
      inv.invoice_key,
      inv.issued_at,
      inv.last_sync_at AS invoice_sync_at,
      -- ============================================================
      -- Régua fiel ao Mercado Livre (card "Para enviar"):
      --   • aguardando_nf  = NF-e para gerenciar
      --                      (logística não-Flex, sem NF emitida e substatus fiscal pendente)
      --   • para_imprimir  = Etiquetas para imprimir
      --                      (envio ativo, etiqueta liberada, ainda NÃO impressa/coletada)
      --   • pronta_enviar  = Prontas para enviar
      --                      (envio ativo, etiqueta já impressa / em packing_list / aguardando coleta)
      --   • full / enviado / pendente_sync / outros — fora do "Para enviar".
      -- ============================================================
      CASE
        WHEN s.shipment_id IS NULL AND o.shipment_id IS NOT NULL THEN 'pendente_sync'
        WHEN o.shipment_id IS NULL THEN 'outros'
        WHEN s.shipment_status IN ('delivered', 'not_delivered') THEN 'enviado'
        WHEN s.shipment_status = 'shipped' THEN 'enviado'
        WHEN s.shipment_substatus IN ('in_hub', 'dropped_off') THEN 'enviado'
        WHEN s.logistic_type = 'fulfillment' THEN 'full'
        -- 1) NF-e para gerenciar: precisa de NF e ainda não foi emitida.
        WHEN (
          s.logistic_type IS DISTINCT FROM 'self_service'
          AND s.shipment_status IN ('ready_to_ship', 'handling', 'pending')
          AND (
            s.shipment_substatus = 'invoice_pending'
            OR (
              COALESCE(inv.invoice_status, 'pendente') <> 'emitida'
              AND COALESCE(s.shipment_substatus, '') NOT IN (
                'invoice_issued', 'invoice_validated', 'not_required',
                'ready_to_print', 'printed', 'ready_for_pickup', 'in_packing_list'
              )
            )
          )
        ) THEN 'aguardando_nf'
        -- 2) Prontas para enviar: etiqueta já impressa / aguardando coleta.
        WHEN (
          COALESCE(s.label_available, false)
          AND s.shipment_status IN ('ready_to_ship', 'handling', 'pending')
          AND s.shipment_substatus IN ('printed', 'ready_for_pickup', 'in_packing_list')
        ) THEN 'pronta_enviar'
        -- 3) Etiquetas para imprimir: etiqueta liberada mas ainda não impressa.
        WHEN (
          COALESCE(s.label_available, false)
          AND s.shipment_status IN ('ready_to_ship', 'handling', 'pending')
          AND (
            s.logistic_type = 'self_service'
            OR COALESCE(inv.invoice_status, 'pendente') = 'emitida'
            OR s.shipment_substatus IN (
              'ready_to_print',
              'invoice_issued', 'invoice_validated', 'not_required'
            )
          )
        ) THEN 'para_imprimir'
        ELSE 'outros'
      END AS final_status,
      -- "Reimprimir" como indicador visual: já impressa e ainda acionável.
      CASE
        WHEN COALESCE(s.label_available, false)
             AND s.shipment_status IN ('ready_to_ship', 'handling', 'pending')
             AND s.shipment_substatus IN ('printed', 'ready_for_pickup', 'in_packing_list')
          THEN true
        ELSE false
      END AS is_reprint,
      CASE
        WHEN COALESCE(s.label_available, false)
             AND s.shipment_status IN ('ready_to_ship', 'handling', 'pending')
             AND (
               s.logistic_type = 'self_service'
               OR COALESCE(inv.invoice_status, 'pendente') = 'emitida'
               OR s.shipment_substatus IN (
                 'ready_to_print', 'printed',
                 'invoice_issued', 'invoice_validated', 'not_required',
                 'ready_for_pickup', 'in_packing_list'
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
            (
              (
                COALESCE(s.estimated_schedule_limit, s.estimated_handling_limit) IS NOT NULL
                AND (
                  (COALESCE(s.estimated_schedule_limit, s.estimated_handling_limit) AT TIME ZONE 'America/Sao_Paulo')::date = v_today
                  OR (
                    (COALESCE(s.estimated_schedule_limit, s.estimated_handling_limit) AT TIME ZONE 'America/Sao_Paulo')::date <= v_yesterday
                    AND s.shipment_status NOT IN ('delivered', 'shipped', 'not_delivered')
                    AND s.shipment_substatus IS DISTINCT FROM 'in_hub'
                    AND s.shipment_substatus IS DISTINCT FROM 'dropped_off'
                  )
                )
              )
              OR
              (
                s.estimated_schedule_limit IS NULL
                AND s.estimated_handling_limit IS NULL
                AND s.logistic_type IS DISTINCT FROM 'fulfillment'
                AND s.shipment_status IN ('ready_to_ship', 'handling')
                AND COALESCE(s.label_available, false)
                AND (o.created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date >= v_yesterday
              )
            )
          ELSE
            (p_date_from IS NULL OR o.created_at_meli >= p_date_from)
            AND (p_date_to IS NULL OR o.created_at_meli <= p_date_to)
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
        WHEN 'pendente_sync' THEN 4
        WHEN 'full' THEN 5
        WHEN 'enviado' THEN 6
        ELSE 7
      END ASC
  ),
  -- "Envios de hoje" e demais janelas operacionais devem mostrar somente o
  -- universo do card "Para enviar" do Mercado Livre.
  operational AS (
    SELECT * FROM deduped
    WHERE
      p_period_type <> 'today_dispatch'
      OR final_status IN ('aguardando_nf', 'para_imprimir', 'pronta_enviar')
  ),
  searched AS (
    SELECT * FROM operational
    WHERE p_search_query = '' OR (
      order_id ILIKE '%' || p_search_query || '%'
      OR buyer_nickname ILIKE '%' || p_search_query || '%'
      OR shipment_id ILIKE '%' || p_search_query || '%'
      OR receiver_name ILIKE '%' || p_search_query || '%'
    )
  ),
  -- Contadores: "all" reflete o universo operacional (aguardando_nf + para_imprimir + pronta_enviar)
  -- para alinhar com o card "Para enviar" do Mercado Livre.
  counts AS (
    SELECT
      COUNT(*) FILTER (WHERE final_status IN ('aguardando_nf', 'para_imprimir', 'pronta_enviar')) AS cnt_all,
      COUNT(*) FILTER (WHERE final_status = 'aguardando_nf') AS cnt_aguardando_nf,
      COUNT(*) FILTER (WHERE final_status = 'para_imprimir') AS cnt_para_imprimir,
      COUNT(*) FILTER (WHERE final_status = 'pronta_enviar') AS cnt_pronta_enviar,
      COUNT(*) FILTER (WHERE is_reprint AND final_status IN ('para_imprimir', 'pronta_enviar')) AS cnt_reimprimir
    FROM searched
  ),
  filtered AS (
    SELECT * FROM searched
    WHERE
      CASE
        WHEN p_status_filter IN ('all', '') THEN
          final_status IN ('aguardando_nf', 'para_imprimir', 'pronta_enviar')
        WHEN p_status_filter = 'reimprimir' THEN
          is_reprint AND final_status IN ('para_imprimir', 'pronta_enviar')
        -- Compatibilidade: clientes antigos podem ainda mandar 'pronta'.
        WHEN p_status_filter = 'pronta' THEN
          final_status IN ('para_imprimir', 'pronta_enviar')
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
      CASE WHEN p_sort_field = 'created_at_meli' AND p_sort_dir = 'desc' THEN created_at_meli END DESC NULLS LAST,
      CASE WHEN p_sort_field = 'created_at_meli' AND p_sort_dir = 'asc'  THEN created_at_meli END ASC  NULLS LAST,
      CASE WHEN p_sort_field = 'buyer_nickname' AND p_sort_dir = 'desc' THEN buyer_nickname END DESC NULLS LAST,
      CASE WHEN p_sort_field = 'buyer_nickname' AND p_sort_dir = 'asc'  THEN buyer_nickname END ASC  NULLS LAST,
      CASE WHEN p_sort_field = 'final_status' AND p_sort_dir = 'asc' THEN
        CASE final_status
          WHEN 'pronta_enviar' THEN 1
          WHEN 'para_imprimir' THEN 2
          WHEN 'aguardando_nf' THEN 3
          WHEN 'pendente_sync' THEN 4
          WHEN 'full' THEN 5
          WHEN 'enviado' THEN 6
          ELSE 7
        END
      END ASC NULLS LAST,
      CASE WHEN p_sort_field = 'final_status' AND p_sort_dir = 'desc' THEN
        CASE final_status
          WHEN 'pronta_enviar' THEN 1
          WHEN 'para_imprimir' THEN 2
          WHEN 'aguardando_nf' THEN 3
          WHEN 'pendente_sync' THEN 4
          WHEN 'full' THEN 5
          WHEN 'enviado' THEN 6
          ELSE 7
        END
      END DESC NULLS LAST
    LIMIT p_page_size OFFSET v_offset
  )
  SELECT
    jsonb_build_object(
      'orders', COALESCE((SELECT jsonb_agg(row_to_json(sorted.*)) FROM sorted), '[]'::jsonb),
      'total_count', (SELECT total_count FROM total),
      'status_counts', jsonb_build_object(
        'all', (SELECT cnt_all FROM counts),
        'aguardando_nf', (SELECT cnt_aguardando_nf FROM counts),
        'para_imprimir', (SELECT cnt_para_imprimir FROM counts),
        'pronta_enviar', (SELECT cnt_pronta_enviar FROM counts),
        -- Mantemos chaves antigas para compatibilidade até o frontend atualizar.
        'pronta', (SELECT cnt_para_imprimir + cnt_pronta_enviar FROM counts),
        'reimprimir', (SELECT cnt_reimprimir FROM counts)
      )
    )
  INTO v_result;

  RETURN v_result;
END;
$function$;