CREATE OR REPLACE FUNCTION count_distinct_active_items(p_seller_id text)
RETURNS TABLE(
  total_distinct bigint,
  updated_recently bigint,
  awaiting_collection bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(DISTINCT item_id) AS total_distinct,
    COUNT(DISTINCT CASE 
      WHEN last_visit_collection_at >= NOW() - INTERVAL '4 days' THEN item_id 
    END) AS updated_recently,
    COUNT(DISTINCT CASE 
      WHEN last_visit_collection_at IS NULL OR last_visit_collection_at < NOW() - INTERVAL '4 days' THEN item_id 
    END) AS awaiting_collection
  FROM meli_listings_cache
  WHERE seller_id = p_seller_id
    AND status = 'active';
$$;