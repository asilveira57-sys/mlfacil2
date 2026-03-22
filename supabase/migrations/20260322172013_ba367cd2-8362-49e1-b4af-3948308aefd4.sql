
-- Table: listing_keyword_feedback (seller feedback on keywords)
CREATE TABLE IF NOT EXISTS public.listing_keyword_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  seller_id text NOT NULL,
  listing_id text NOT NULL,
  keyword text NOT NULL,
  is_relevant boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(seller_id, listing_id, keyword)
);

CREATE INDEX IF NOT EXISTS idx_lkf_seller_listing ON public.listing_keyword_feedback(seller_id, listing_id);
ALTER TABLE public.listing_keyword_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users manage own keyword feedback"
  ON public.listing_keyword_feedback FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- Table: title_suggestion_analysis
CREATE TABLE IF NOT EXISTS public.title_suggestion_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  seller_id text NOT NULL,
  listing_id text NOT NULL,
  current_title text,
  current_length int,
  best_suggestion text,
  best_score int,
  suggestions_json jsonb DEFAULT '[]'::jsonb,
  issues_json jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(seller_id, listing_id)
);

CREATE INDEX IF NOT EXISTS idx_tsa_seller ON public.title_suggestion_analysis(seller_id);
ALTER TABLE public.title_suggestion_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users manage title suggestions"
  ON public.title_suggestion_analysis FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- Add new columns to listing_seo_analysis
ALTER TABLE public.listing_seo_analysis
  ADD COLUMN IF NOT EXISTS keywords_relevantes jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS keywords_presentes jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS keywords_faltantes jsonb DEFAULT '[]'::jsonb;

-- Title suggestion logs
CREATE TABLE IF NOT EXISTS public.title_suggestion_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  seller_id text,
  listing_id text,
  status text NOT NULL,
  action text,
  score int,
  execution_time_ms int,
  message text,
  metadata_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tsl_seller ON public.title_suggestion_logs(seller_id);
ALTER TABLE public.title_suggestion_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on title_suggestion_logs"
  ON public.title_suggestion_logs FOR ALL USING (true) WITH CHECK (true);
