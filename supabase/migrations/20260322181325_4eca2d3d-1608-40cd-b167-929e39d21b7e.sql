
ALTER TABLE public.listing_health_current
  ADD COLUMN IF NOT EXISTS wholesale_score integer,
  ADD COLUMN IF NOT EXISTS wholesale_analysis_json jsonb;
