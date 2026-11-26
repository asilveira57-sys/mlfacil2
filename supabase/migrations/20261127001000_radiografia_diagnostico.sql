-- Radiografia v2 — diagnóstico. Uma doença por anúncio, na ordem de gravidade:
--   sem_dados → sem_estoque → pausado → reclamacoes → parado → sem_exposicao → nao_converte
--   → conteudo_fraco → novo → saudavel
-- Vendas = linhas de meli_order_items_cache (pedidos), igual à Linha do Tempo.
CREATE OR REPLACE FUNCTION public.radiografia_diagnostico(p_seller text)
RETURNS TABLE (
  item_id text, title text, thumbnail text, permalink text, status text,
  price numeric, original_price numeric, em_promocao boolean, available_quantity int,
  health numeric, logistic_type text, catalog_listing boolean, idade_dias int,
  visitas_7d int, visitas_30d int, visitas_30d_anterior int, dias_com_visita_30d int,
  vendas_7d int, vendas_30d int, unidades_30d int, faturamento_30d numeric, conversao_30d numeric,
  ultima_venda date, dias_sem_venda int, reclamacoes_90d int, vendas_90d int,
  doenca text, motivo text, tratamentos int, exame_em timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT owns_seller(p_seller) THEN RAISE EXCEPTION 'conta não pertence ao usuário'; END IF;

  RETURN QUERY
  WITH i AS (
    SELECT * FROM listing_exam_items e WHERE e.seller_id = p_seller AND e.status IN ('active', 'paused')
  ), v AS (
    SELECT m.item_id,
      sum(m.visits) FILTER (WHERE m.day > current_date - 7)::int AS v7,
      sum(m.visits) FILTER (WHERE m.day > current_date - 30)::int AS v30,
      sum(m.visits) FILTER (WHERE m.day <= current_date - 30 AND m.day > current_date - 60)::int AS v30a,
      count(*) FILTER (WHERE m.day > current_date - 30)::int AS d30
    FROM listing_daily_metrics m WHERE m.seller_id = p_seller AND m.day > current_date - 60
    GROUP BY m.item_id
  ), s AS (
    SELECT o.item_id,
      count(*) FILTER (WHERE o.created_at_meli > now() - interval '7 days')::int AS s7,
      count(*) FILTER (WHERE o.created_at_meli > now() - interval '30 days')::int AS s30,
      count(*) FILTER (WHERE o.created_at_meli > now() - interval '90 days')::int AS s90,
      coalesce(sum(o.quantity) FILTER (WHERE o.created_at_meli > now() - interval '30 days'), 0)::int AS u30,
      coalesce(sum(o.quantity * o.unit_price) FILTER (WHERE o.created_at_meli > now() - interval '30 days'), 0) AS r30,
      max(o.created_at_meli) AS ult
    FROM meli_order_items_cache o WHERE o.seller_id = p_seller GROUP BY o.item_id
  ), c AS (
    SELECT lc.item_id, count(*)::int AS n FROM listing_claims lc
    WHERE lc.seller_id = p_seller AND lc.date_created > now() - interval '90 days' GROUP BY lc.item_id
  ), t AS (
    SELECT lt.item_id, count(*)::int AS n FROM listing_treatments lt WHERE lt.seller_id = p_seller GROUP BY lt.item_id
  ), base AS (
    SELECT i.*, coalesce(v.v7, 0) v7, coalesce(v.v30, 0) v30, coalesce(v.v30a, 0) v30a, coalesce(v.d30, 0) d30,
      coalesce(s.s7, 0) s7, coalesce(s.s30, 0) s30, coalesce(s.s90, 0) s90, coalesce(s.u30, 0) u30,
      coalesce(s.r30, 0) r30, s.ult, coalesce(c.n, 0) recl, coalesce(t.n, 0) trat,
      greatest(0, floor(extract(epoch FROM now() - coalesce(i.date_created, now())) / 86400))::int AS idade,
      CASE WHEN s.ult IS NULL THEN NULL ELSE floor(extract(epoch FROM now() - s.ult) / 86400)::int END AS dsv
    FROM i LEFT JOIN v ON v.item_id = i.item_id LEFT JOIN s ON s.item_id = i.item_id
    LEFT JOIN c ON c.item_id = i.item_id LEFT JOIN t ON t.item_id = i.item_id
  ), d AS (
    SELECT b.*,
      CASE WHEN b.v30 > 0 THEN round(b.s30::numeric * 100 / b.v30, 2) ELSE NULL END AS conv,
      CASE
        WHEN b.d30 = 0 THEN 'sem_dados'
        WHEN b.available_quantity = 0 THEN 'sem_estoque'
        WHEN b.status = 'paused' THEN 'pausado'
        WHEN b.recl >= 2 AND b.recl::numeric / greatest(b.s90, 1) >= 0.05 THEN 'reclamacoes'
        WHEN b.idade >= 60 AND (b.dsv IS NULL OR b.dsv >= 60) THEN 'parado'
        WHEN b.idade >= 30 AND b.v30 < 30 THEN 'sem_exposicao'
        WHEN b.v30 >= 60 AND b.s30::numeric * 100 / b.v30 < 0.5 THEN 'nao_converte'
        WHEN b.health IS NOT NULL AND b.health < 0.65 THEN 'conteudo_fraco'
        WHEN b.idade < 30 THEN 'novo'
        ELSE 'saudavel'
      END AS doenca
    FROM base b
  )
  SELECT d.item_id, d.title, d.thumbnail, d.permalink, d.status, d.price, d.original_price,
    (d.original_price IS NOT NULL AND d.original_price > d.price), d.available_quantity, d.health,
    d.logistic_type, d.catalog_listing, d.idade, d.v7, d.v30, d.v30a, d.d30, d.s7, d.s30, d.u30, d.r30, d.conv,
    d.ult::date, d.dsv, d.recl, d.s90, d.doenca,
    CASE d.doenca
      WHEN 'sem_dados' THEN 'Ainda sem exame de visitas. Clique em Atualizar exames.'
      WHEN 'sem_estoque' THEN 'Estoque zerado: o anúncio não vende e perde posição.'
      WHEN 'pausado' THEN 'Anúncio pausado com estoque.'
      WHEN 'reclamacoes' THEN d.recl || ' reclamações em 90 dias para ' || d.s90 || ' vendas (' ||
        round(d.recl::numeric * 100 / greatest(d.s90, 1)) || '%).'
      WHEN 'parado' THEN CASE WHEN d.dsv IS NULL THEN 'Nunca vendeu em ' || d.idade || ' dias no ar.'
        ELSE d.dsv || ' dias sem venda.' END
      WHEN 'sem_exposicao' THEN 'Só ' || d.v30 || ' visitas em 30 dias (menos de 1 por dia).'
      WHEN 'nao_converte' THEN d.v30 || ' visitas e ' || d.s30 || ' vendas em 30 dias (conversão ' ||
        replace(coalesce(d.conv, 0)::text, '.', ',') || '%).'
      WHEN 'conteudo_fraco' THEN 'Qualidade do anúncio no Mercado Livre em ' || round(d.health * 100) || '%.'
      WHEN 'novo' THEN 'Anúncio com ' || d.idade || ' dias. Em observação.'
      ELSE 'Vendendo: ' || d.s30 || ' vendas e ' || d.v30 || ' visitas em 30 dias.'
    END,
    d.trat, d.updated_at
  FROM d;
END;
$$;
REVOKE ALL ON FUNCTION public.radiografia_diagnostico(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.radiografia_diagnostico(text) TO authenticated;
