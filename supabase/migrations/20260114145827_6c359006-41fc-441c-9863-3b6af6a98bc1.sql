-- Ensure idempotency: remove duplicates before creating the unique index
WITH duplicates AS (
  SELECT seller_id, period_key, detail_id
  FROM public.meli_billing_details_cache
  GROUP BY seller_id, period_key, detail_id
  HAVING COUNT(*) > 1
)
DELETE FROM public.meli_billing_details_cache t
USING public.meli_billing_details_cache t2
WHERE t.seller_id = t2.seller_id
  AND t.period_key = t2.period_key
  AND t.detail_id = t2.detail_id
  AND t.ctid < t2.ctid
  AND EXISTS (
    SELECT 1
    FROM duplicates d
    WHERE d.seller_id = t.seller_id
      AND d.period_key = t.period_key
      AND d.detail_id = t.detail_id
  );

-- Unique constraint/index required for PostgREST upsert(onConflict=...)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'meli_billing_details_cache'
      AND indexname = 'meli_billing_details_cache_seller_period_detail_uidx'
  ) THEN
    CREATE UNIQUE INDEX meli_billing_details_cache_seller_period_detail_uidx
      ON public.meli_billing_details_cache (seller_id, period_key, detail_id);
  END IF;
END $$;