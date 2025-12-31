-- ============================================
-- MÓDULO CONCORRÊNCIA - TABELAS PRINCIPAIS
-- ============================================

-- 1) meli_listings_cache (cache dos anúncios do seller)
CREATE TABLE public.meli_listings_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  variation_id TEXT NOT NULL DEFAULT '',
  sku TEXT,
  title TEXT,
  title_short TEXT,
  permalink TEXT,
  thumbnail TEXT,
  catalog_product_id TEXT,
  category_id TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  original_price NUMERIC,
  currency_id TEXT DEFAULT 'BRL',
  condition TEXT,
  listing_type_id TEXT,
  logistic_type TEXT,
  available_quantity INTEGER DEFAULT 0,
  sold_quantity INTEGER DEFAULT 0,
  status TEXT,
  health NUMERIC,
  last_sync_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(seller_id, item_id, variation_id)
);

ALTER TABLE public.meli_listings_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meli_listings_cache_all"
ON public.meli_listings_cache FOR ALL
USING (auth.uid() = user_id);

CREATE INDEX idx_meli_listings_seller ON public.meli_listings_cache(seller_id);
CREATE INDEX idx_meli_listings_catalog ON public.meli_listings_cache(catalog_product_id) WHERE catalog_product_id IS NOT NULL;
CREATE INDEX idx_meli_listings_category ON public.meli_listings_cache(category_id);

-- 2) competitor_market_snapshots (snapshot de mercado por query)
CREATE TABLE public.competitor_market_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  snapshot_key TEXT NOT NULL,
  query_term TEXT,
  category_id TEXT,
  filters_json JSONB,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  total_results INTEGER DEFAULT 0,
  p10_price NUMERIC,
  p25_price NUMERIC,
  p50_price NUMERIC,
  p75_price NUMERIC,
  p90_price NUMERIC,
  avg_price NUMERIC,
  min_price NUMERIC,
  max_price NUMERIC,
  top_competitors_json JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(seller_id, snapshot_key)
);

ALTER TABLE public.competitor_market_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "competitor_market_snapshots_all"
ON public.competitor_market_snapshots FOR ALL
USING (auth.uid() = user_id);

CREATE INDEX idx_market_snapshots_seller ON public.competitor_market_snapshots(seller_id);
CREATE INDEX idx_market_snapshots_expires ON public.competitor_market_snapshots(expires_at);

-- 3) competitor_catalog_snapshots (snapshot por catálogo)
CREATE TABLE public.competitor_catalog_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  catalog_product_id TEXT NOT NULL,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  your_item_id TEXT,
  your_price NUMERIC,
  total_offers INTEGER DEFAULT 0,
  market_price_min NUMERIC,
  market_price_median NUMERIC,
  market_price_max NUMERIC,
  market_price_avg NUMERIC,
  your_position INTEGER,
  competitor_offers_json JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(seller_id, catalog_product_id)
);

ALTER TABLE public.competitor_catalog_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "competitor_catalog_snapshots_all"
ON public.competitor_catalog_snapshots FOR ALL
USING (auth.uid() = user_id);

CREATE INDEX idx_catalog_snapshots_seller ON public.competitor_catalog_snapshots(seller_id);
CREATE INDEX idx_catalog_snapshots_catalog ON public.competitor_catalog_snapshots(catalog_product_id);

-- 4) competitor_alerts (alertas e recomendações)
CREATE TABLE public.competitor_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  product_key TEXT,
  item_id TEXT,
  catalog_product_id TEXT,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  message_pt TEXT NOT NULL,
  data_json JSONB,
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.competitor_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "competitor_alerts_all"
ON public.competitor_alerts FOR ALL
USING (auth.uid() = user_id);

CREATE INDEX idx_competitor_alerts_seller ON public.competitor_alerts(seller_id);
CREATE INDEX idx_competitor_alerts_unread ON public.competitor_alerts(seller_id, is_dismissed, is_read) WHERE is_dismissed = false;

-- 5) competitor_settings (configurações do módulo)
CREATE TABLE public.competitor_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  default_snapshot_ttl_hours INTEGER NOT NULL DEFAULT 12,
  max_requests_per_minute INTEGER NOT NULL DEFAULT 10,
  default_search_filters_json JSONB,
  margin_floor_percent NUMERIC NOT NULL DEFAULT 8,
  target_margin_percent NUMERIC NOT NULL DEFAULT 15,
  auto_monitor_abc_a BOOLEAN NOT NULL DEFAULT true,
  auto_monitor_trending BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(seller_id)
);

ALTER TABLE public.competitor_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "competitor_settings_all"
ON public.competitor_settings FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);