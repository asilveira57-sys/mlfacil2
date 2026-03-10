
CREATE OR REPLACE FUNCTION public.get_order_items_enrichment(p_item_ids text[])
RETURNS TABLE(
  item_id text,
  title text,
  thumbnail text,
  unit_price numeric,
  variation_id text,
  sku text
)
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT DISTINCT ON (oi.item_id)
    oi.item_id,
    oi.title,
    oi.thumbnail,
    oi.unit_price,
    oi.variation_id,
    oi.sku
  FROM public.meli_order_items_cache oi
  WHERE oi.item_id = ANY(p_item_ids)
  ORDER BY oi.item_id,
    (oi.thumbnail IS NOT NULL) DESC,
    (oi.title IS NOT NULL) DESC,
    oi.created_at_meli DESC;
$$;
