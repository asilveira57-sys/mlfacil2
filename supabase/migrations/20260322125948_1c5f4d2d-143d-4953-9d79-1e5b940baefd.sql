
-- Table: market_keywords_cache (keywords by category from sales data)
CREATE TABLE IF NOT EXISTS public.market_keywords_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id text NOT NULL,
  keyword text NOT NULL,
  normalized_keyword text NOT NULL,
  weight numeric NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'sales',
  occurrence_count int NOT NULL DEFAULT 1,
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(category_id, normalized_keyword)
);

CREATE INDEX IF NOT EXISTS idx_mkc_category ON public.market_keywords_cache(category_id);
CREATE INDEX IF NOT EXISTS idx_mkc_weight ON public.market_keywords_cache(category_id, weight DESC);

ALTER TABLE public.market_keywords_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on market_keywords_cache"
  ON public.market_keywords_cache FOR ALL USING (true) WITH CHECK (true);

-- Table: listing_seo_analysis (detailed SEO analysis per listing)
CREATE TABLE IF NOT EXISTS public.listing_seo_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  seller_id text NOT NULL,
  item_id text NOT NULL,
  seo_structural_score int NOT NULL DEFAULT 0,
  seo_keyword_score int NOT NULL DEFAULT 0,
  seo_score int NOT NULL DEFAULT 0,
  seo_grade text NOT NULL DEFAULT 'D',
  keyword_coverage_ratio numeric DEFAULT 0,
  missing_keywords jsonb DEFAULT '[]'::jsonb,
  irrelevant_keywords jsonb DEFAULT '[]'::jsonb,
  issues jsonb DEFAULT '[]'::jsonb,
  suggestions jsonb DEFAULT '[]'::jsonb,
  analysis_details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(seller_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_lsa_seller ON public.listing_seo_analysis(seller_id);
CREATE INDEX IF NOT EXISTS idx_lsa_item ON public.listing_seo_analysis(seller_id, item_id);
CREATE INDEX IF NOT EXISTS idx_lsa_tenant ON public.listing_seo_analysis(tenant_id);

ALTER TABLE public.listing_seo_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on listing_seo_analysis"
  ON public.listing_seo_analysis FOR ALL USING (true) WITH CHECK (true);

-- Table: seo_analysis_logs
CREATE TABLE IF NOT EXISTS public.seo_analysis_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  seller_id text,
  item_id text,
  status text NOT NULL,
  action text,
  score int,
  execution_time_ms int,
  message text,
  metadata_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sal_seller ON public.seo_analysis_logs(seller_id);
CREATE INDEX IF NOT EXISTS idx_sal_created ON public.seo_analysis_logs(created_at DESC);

ALTER TABLE public.seo_analysis_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on seo_analysis_logs"
  ON public.seo_analysis_logs FOR ALL USING (true) WITH CHECK (true);

-- Add seo_grade + seo_structural_score + seo_keyword_score to listing_health_current
ALTER TABLE public.listing_health_current
  ADD COLUMN IF NOT EXISTS seo_grade text,
  ADD COLUMN IF NOT EXISTS seo_structural_score int,
  ADD COLUMN IF NOT EXISTS seo_keyword_score int,
  ADD COLUMN IF NOT EXISTS seo_updated_at timestamptz;
