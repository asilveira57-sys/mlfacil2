
-- Cache table for daily ADS metrics per seller
CREATE TABLE public.ads_period_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  metric_date DATE NOT NULL,
  total_spent NUMERIC NOT NULL DEFAULT 0,
  total_revenue NUMERIC NOT NULL DEFAULT 0,
  total_clicks INTEGER NOT NULL DEFAULT 0,
  total_impressions INTEGER NOT NULL DEFAULT 0,
  total_conversions INTEGER NOT NULL DEFAULT 0,
  items_data JSONB DEFAULT '[]'::jsonb,
  campaigns_data JSONB DEFAULT '[]'::jsonb,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(seller_id, metric_date)
);

-- Index for fast range queries
CREATE INDEX idx_ads_period_cache_seller_date ON public.ads_period_cache (seller_id, metric_date);

-- Enable RLS
ALTER TABLE public.ads_period_cache ENABLE ROW LEVEL SECURITY;

-- Users can only see their own cache
CREATE POLICY "Users can view own ads cache"
  ON public.ads_period_cache FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ads cache"
  ON public.ads_period_cache FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ads cache"
  ON public.ads_period_cache FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own ads cache"
  ON public.ads_period_cache FOR DELETE
  USING (auth.uid() = user_id);

-- Service role bypass for edge functions
CREATE POLICY "Service role full access to ads cache"
  ON public.ads_period_cache FOR ALL
  USING (true)
  WITH CHECK (true);
