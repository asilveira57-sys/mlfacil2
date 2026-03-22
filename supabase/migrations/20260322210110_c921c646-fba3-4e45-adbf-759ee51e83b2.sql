
-- Table for ML autocomplete suggestions cache
CREATE TABLE IF NOT EXISTS public.ml_autocomplete_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id text NOT NULL,
  base_term text NOT NULL,
  keyword text NOT NULL,
  normalized_keyword text NOT NULL,
  source text NOT NULL DEFAULT 'autocomplete',
  weight numeric NOT NULL DEFAULT 0.5,
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(category_id, base_term, normalized_keyword)
);

CREATE INDEX IF NOT EXISTS idx_ml_autocomplete_cache_category ON public.ml_autocomplete_cache(category_id);
CREATE INDEX IF NOT EXISTS idx_ml_autocomplete_cache_base_term ON public.ml_autocomplete_cache(base_term);

ALTER TABLE public.ml_autocomplete_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access on ml_autocomplete_cache"
  ON public.ml_autocomplete_cache FOR ALL
  USING (true) WITH CHECK (true);

-- Table for ML top listing terms cache
CREATE TABLE IF NOT EXISTS public.ml_top_listings_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id text NOT NULL,
  search_term text NOT NULL,
  keyword text NOT NULL,
  normalized_keyword text NOT NULL,
  occurrence_count int NOT NULL DEFAULT 1,
  source text NOT NULL DEFAULT 'top_listings',
  weight numeric NOT NULL DEFAULT 0.5,
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(category_id, search_term, normalized_keyword)
);

CREATE INDEX IF NOT EXISTS idx_ml_top_listings_cache_category ON public.ml_top_listings_cache(category_id);
CREATE INDEX IF NOT EXISTS idx_ml_top_listings_cache_search ON public.ml_top_listings_cache(search_term);

ALTER TABLE public.ml_top_listings_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access on ml_top_listings_cache"
  ON public.ml_top_listings_cache FOR ALL
  USING (true) WITH CHECK (true);

-- Add source column to market_keywords_cache if not tracking multi-source
ALTER TABLE public.market_keywords_cache ADD COLUMN IF NOT EXISTS in_autocomplete boolean DEFAULT false;
ALTER TABLE public.market_keywords_cache ADD COLUMN IF NOT EXISTS in_top_listings boolean DEFAULT false;
ALTER TABLE public.market_keywords_cache ADD COLUMN IF NOT EXISTS relevance_score numeric DEFAULT 0;
