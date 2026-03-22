-- Add 4-layer SEO sub-scores and metadata to listing_seo_analysis
ALTER TABLE public.listing_seo_analysis
  ADD COLUMN IF NOT EXISTS title_score int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description_score int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attributes_score int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS model_score int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description_length int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS keyword_density numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS missing_attributes jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS weak_attributes jsonb DEFAULT '[]'::jsonb;

-- Add 4-layer SEO to listing_health_current for fast access
ALTER TABLE public.listing_health_current
  ADD COLUMN IF NOT EXISTS seo_title_score int,
  ADD COLUMN IF NOT EXISTS seo_description_score int,
  ADD COLUMN IF NOT EXISTS seo_attributes_score int,
  ADD COLUMN IF NOT EXISTS seo_model_score int,
  ADD COLUMN IF NOT EXISTS seo_description_length int;