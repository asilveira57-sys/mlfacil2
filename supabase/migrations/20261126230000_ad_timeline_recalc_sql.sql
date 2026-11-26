-- Linha do Tempo: recálculo em SQL (substitui a edge function ad-timeline-recalculate).
-- Faz em uma consulta o que a função fazia puxando todas as vendas para a memória.
-- Corrige: limite de 1.000 anúncios, linhas fantasmas, eventos GAP duplicados.
ALTER TABLE public.ad_timeline_stats ADD COLUMN IF NOT EXISTS listing_first_seen_at timestamptz;

CREATE OR REPLACE FUNCTION public.ad_timeline_recalc(p_workspace_id uuid, p_account text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_t int[];
  v_now timestamptz := now();
  acc record;
  v_n int;
  v_total int := 0;
  v_gaps int := 0;
  v_removidos int := 0;
  v_contas int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = p_workspace_id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'workspace não pertence ao usuário';
  END IF;

  SELECT ARRAY(SELECT (jsonb_array_elements_text(thresholds_days))::int)
    INTO v_t FROM ad_timeline_settings WHERE workspace_id = p_workspace_id LIMIT 1;
  IF v_t IS NULL OR coalesce(array_length(v_t, 1), 0) <> 4 THEN v_t := ARRAY[30, 60, 90, 120]; END IF;

  FOR acc IN
    SELECT id, seller_id FROM unified_marketplace_accounts
    WHERE user_id = v_uid AND (p_account IS NULL OR id::text = p_account OR seller_id = p_account)
  LOOP
    v_contas := v_contas + 1;

    WITH v AS (
      SELECT item_id, created_at_meli AS d FROM meli_order_items_cache
      WHERE user_id = v_uid AND seller_id = acc.seller_id AND created_at_meli IS NOT NULL
    ), g AS (
      SELECT item_id, d, extract(epoch FROM d - lag(d) OVER (PARTITION BY item_id ORDER BY d)) / 3600 AS gap_h FROM v
    ), s AS (
      SELECT item_id, min(d) AS first_d, max(d) AS last_d,
        count(*) FILTER (WHERE d > v_now - interval '30 days')  AS c30,
        count(*) FILTER (WHERE d > v_now - interval '60 days')  AS c60,
        count(*) FILTER (WHERE d > v_now - interval '90 days')  AS c90,
        count(*) FILTER (WHERE d > v_now - interval '120 days') AS c120,
        avg(gap_h) AS avg_g,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY gap_h) AS med_g,
        max(gap_h) AS max_g
      FROM g GROUP BY item_id
    ), l AS (
      SELECT item_id, min(created_at) AS visto FROM meli_listings_cache
      WHERE user_id = v_uid AND seller_id = acc.seller_id GROUP BY item_id
    ), todos AS (
      SELECT s.item_id, s.first_d, s.last_d,
        floor(extract(epoch FROM v_now - s.last_d) / 86400)::int AS dias,
        s.c30, s.c60, s.c90, s.c120, s.avg_g, s.med_g, s.max_g, l.visto
      FROM s LEFT JOIN l ON l.item_id = s.item_id
      UNION ALL
      SELECT l.item_id, NULL, NULL, NULL, 0, 0, 0, 0, NULL, NULL, NULL, l.visto
      FROM l WHERE NOT EXISTS (SELECT 1 FROM s WHERE s.item_id = l.item_id)
    )
    INSERT INTO ad_timeline_stats AS t (
      workspace_id, ml_account_id, item_id, first_sale_at, last_sale_at, days_since_last_sale,
      sales_count_30d, sales_count_60d, sales_count_90d, sales_count_120d,
      avg_gap_hours, median_gap_hours, max_gap_hours, status_bucket, listing_first_seen_at, updated_at
    )
    SELECT p_workspace_id, acc.id, item_id, first_d, last_d, dias, c30, c60, c90, c120, avg_g, med_g, max_g,
      CASE
        WHEN last_d IS NULL THEN 'NO_SALES'
        WHEN dias >= v_t[4] THEN '120D'
        WHEN dias >= v_t[3] THEN '90D'
        WHEN dias >= v_t[2] THEN '60D'
        WHEN dias >= v_t[1] THEN '30D'
        ELSE 'OK'
      END,
      visto, v_now
    FROM todos
    ON CONFLICT (workspace_id, ml_account_id, item_id) DO UPDATE SET
      first_sale_at = EXCLUDED.first_sale_at, last_sale_at = EXCLUDED.last_sale_at,
      days_since_last_sale = EXCLUDED.days_since_last_sale,
      sales_count_30d = EXCLUDED.sales_count_30d, sales_count_60d = EXCLUDED.sales_count_60d,
      sales_count_90d = EXCLUDED.sales_count_90d, sales_count_120d = EXCLUDED.sales_count_120d,
      avg_gap_hours = EXCLUDED.avg_gap_hours, median_gap_hours = EXCLUDED.median_gap_hours,
      max_gap_hours = EXCLUDED.max_gap_hours, status_bucket = EXCLUDED.status_bucket,
      listing_first_seen_at = EXCLUDED.listing_first_seen_at, updated_at = EXCLUDED.updated_at;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;

    -- Linhas fantasmas: anúncio que não aparece mais nem em vendas nem em anúncios
    DELETE FROM ad_timeline_stats
    WHERE workspace_id = p_workspace_id AND ml_account_id = acc.id AND updated_at < v_now;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_removidos := v_removidos + v_n;

    -- Eventos GAP (> 7 dias sem venda entre duas vendas): recria em vez de acumular
    DELETE FROM ad_timeline_events
    WHERE workspace_id = p_workspace_id AND ml_account_id = acc.id AND event_type = 'GAP';

    INSERT INTO ad_timeline_events (workspace_id, ml_account_id, item_id, event_type, occurred_at, payload)
    SELECT p_workspace_id, acc.id, item_id, 'GAP', prev_d,
      jsonb_build_object(
        'gap_hours', round((extract(epoch FROM d - prev_d) / 3600)::numeric, 2),
        'gap_days', round((extract(epoch FROM d - prev_d) / 86400)::numeric, 1),
        'from', prev_d, 'to', d)
    FROM (
      SELECT item_id, created_at_meli AS d,
        lag(created_at_meli) OVER (PARTITION BY item_id ORDER BY created_at_meli) AS prev_d
      FROM meli_order_items_cache
      WHERE user_id = v_uid AND seller_id = acc.seller_id AND created_at_meli IS NOT NULL
    ) x
    WHERE prev_d IS NOT NULL AND d - prev_d > interval '7 days';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_gaps := v_gaps + v_n;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'processed', v_total, 'removed', v_removidos,
    'events_created', v_gaps, 'accounts', v_contas, 'thresholds_used', to_jsonb(v_t));
END;
$$;

REVOKE ALL ON FUNCTION public.ad_timeline_recalc(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ad_timeline_recalc(uuid, text) TO authenticated;
