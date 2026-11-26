-- Radiografia v2 — série diária e acompanhamento de tratamentos.

-- Série dia a dia de um anúncio: visitas (exame) + vendas (pedidos)
CREATE OR REPLACE FUNCTION public.radiografia_serie(p_seller text, p_item text, p_dias int DEFAULT 90)
RETURNS TABLE (dia date, visitas int, vendas int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT owns_seller(p_seller) THEN RAISE EXCEPTION 'conta não pertence ao usuário'; END IF;
  RETURN QUERY
  SELECT g::date,
    coalesce((SELECT m.visits FROM listing_daily_metrics m
              WHERE m.seller_id = p_seller AND m.item_id = p_item AND m.day = g::date), 0),
    coalesce((SELECT count(*)::int FROM meli_order_items_cache o
              WHERE o.seller_id = p_seller AND o.item_id = p_item
                AND (o.created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date = g::date), 0)
  FROM generate_series(current_date - (least(p_dias, 400) - 1), current_date, interval '1 day') g;
END;
$$;
REVOKE ALL ON FUNCTION public.radiografia_serie(text, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.radiografia_serie(text, text, int) TO authenticated;

-- Tratamentos com antes x depois. Antes = 14 dias anteriores à aplicação.
-- Depois = 14 e 30 dias seguintes. Veredito pelo indicador principal:
-- vendas/dia (ou visitas/dia, se não havia venda antes): ≥ +20% melhorou, ≤ −20% piorou.
CREATE OR REPLACE FUNCTION public.radiografia_tratamentos(p_seller text, p_item text DEFAULT NULL)
RETURNS TABLE (
  id uuid, item_id text, titulo text, doenca text, remedio text, nota text, aplicado_em date, dias_desde int,
  antes_visitas_dia numeric, antes_vendas_dia numeric, antes_conversao numeric,
  depois14_visitas_dia numeric, depois14_vendas_dia numeric, depois14_conversao numeric,
  depois30_visitas_dia numeric, depois30_vendas_dia numeric, depois30_conversao numeric,
  resultado text, variacao_pct numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT owns_seller(p_seller) THEN RAISE EXCEPTION 'conta não pertence ao usuário'; END IF;
  RETURN QUERY
  WITH t AS (
    SELECT lt.*, (current_date - lt.applied_at)::int AS desde FROM listing_treatments lt
    WHERE lt.seller_id = p_seller AND (p_item IS NULL OR lt.item_id = p_item)
  ), j AS (
    SELECT t.*,
      (SELECT coalesce(sum(m.visits), 0) FROM listing_daily_metrics m WHERE m.seller_id = p_seller AND m.item_id = t.item_id
        AND m.day >= t.applied_at - 14 AND m.day < t.applied_at) AS va,
      (SELECT count(*) FROM meli_order_items_cache o WHERE o.seller_id = p_seller AND o.item_id = t.item_id
        AND o.created_at_meli >= t.applied_at - 14 AND o.created_at_meli < t.applied_at) AS sa,
      (SELECT coalesce(sum(m.visits), 0) FROM listing_daily_metrics m WHERE m.seller_id = p_seller AND m.item_id = t.item_id
        AND m.day > t.applied_at AND m.day <= t.applied_at + 14) AS v14,
      (SELECT count(*) FROM meli_order_items_cache o WHERE o.seller_id = p_seller AND o.item_id = t.item_id
        AND o.created_at_meli >= t.applied_at + 1 AND o.created_at_meli < t.applied_at + 15) AS s14,
      (SELECT coalesce(sum(m.visits), 0) FROM listing_daily_metrics m WHERE m.seller_id = p_seller AND m.item_id = t.item_id
        AND m.day > t.applied_at AND m.day <= t.applied_at + 30) AS v30,
      (SELECT count(*) FROM meli_order_items_cache o WHERE o.seller_id = p_seller AND o.item_id = t.item_id
        AND o.created_at_meli >= t.applied_at + 1 AND o.created_at_meli < t.applied_at + 31) AS s30,
      least(greatest(t.desde, 0), 14) AS n14, least(greatest(t.desde, 0), 30) AS n30
    FROM t
  ), k AS (
    SELECT j.*,
      round(j.va / 14.0, 1) AS a_v, round(j.sa / 14.0, 2) AS a_s,
      CASE WHEN j.n14 > 0 THEN round(j.v14::numeric / j.n14, 1) END AS d_v14,
      CASE WHEN j.n14 > 0 THEN round(j.s14::numeric / j.n14, 2) END AS d_s14,
      CASE WHEN j.n30 > 0 THEN round(j.v30::numeric / j.n30, 1) END AS d_v30,
      CASE WHEN j.n30 > 0 THEN round(j.s30::numeric / j.n30, 2) END AS d_s30
    FROM j
  ), r AS (
    SELECT k.*,
      -- indicador principal: vendas/dia; se não havia venda antes, visitas/dia
      CASE WHEN k.sa > 0 THEN k.sa / 14.0 ELSE k.va / 14.0 END AS base_ind,
      CASE WHEN k.desde >= 30 THEN (CASE WHEN k.sa > 0 THEN k.s30::numeric / 30 ELSE k.v30::numeric / 30 END)
           WHEN k.desde >= 14 THEN (CASE WHEN k.sa > 0 THEN k.s14::numeric / 14 ELSE k.v14::numeric / 14 END)
      END AS dep_ind
    FROM k
  )
  SELECT r.id, r.item_id, e.title, r.disease, r.remedy, r.note, r.applied_at, r.desde,
    r.a_v, r.a_s, CASE WHEN r.va > 0 THEN round(r.sa::numeric * 100 / r.va, 2) END,
    r.d_v14, r.d_s14, CASE WHEN r.v14 > 0 THEN round(r.s14::numeric * 100 / r.v14, 2) END,
    r.d_v30, r.d_s30, CASE WHEN r.v30 > 0 THEN round(r.s30::numeric * 100 / r.v30, 2) END,
    CASE
      WHEN r.desde < 14 THEN 'aguardando'
      WHEN r.base_ind = 0 AND r.dep_ind > 0 THEN 'melhorou'
      WHEN r.base_ind = 0 THEN 'sem_efeito'
      WHEN r.dep_ind >= r.base_ind * 1.2 THEN 'melhorou'
      WHEN r.dep_ind <= r.base_ind * 0.8 THEN 'piorou'
      ELSE 'sem_efeito'
    END,
    CASE WHEN r.desde >= 14 AND r.base_ind > 0 THEN round((r.dep_ind / r.base_ind - 1) * 100) END
  FROM r LEFT JOIN listing_exam_items e ON e.seller_id = p_seller AND e.item_id = r.item_id
  ORDER BY r.applied_at DESC, r.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.radiografia_tratamentos(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.radiografia_tratamentos(text, text) TO authenticated;
