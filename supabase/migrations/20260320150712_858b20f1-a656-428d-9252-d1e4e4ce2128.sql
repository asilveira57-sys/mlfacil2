-- Add SEO analysis columns to listing_health_current
ALTER TABLE listing_health_current
  ADD COLUMN IF NOT EXISTS seo_score numeric(5,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS seo_keywords_found text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS seo_keywords_missing text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS seo_analysis_json jsonb DEFAULT NULL;

-- Add SEO score index for filtering/sorting
CREATE INDEX IF NOT EXISTS idx_listing_health_current_seo_score
  ON listing_health_current (seller_id, seo_score)
  WHERE seo_score IS NOT NULL;