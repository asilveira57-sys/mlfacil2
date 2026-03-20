
-- ============================================================
-- RADIOGRAPHY MODULE — Database Foundation
-- ============================================================

-- 1. ENUM for backfill status
CREATE TYPE public.radiography_backfill_status AS ENUM ('pending', 'running', 'paused', 'done', 'failed');

-- ============================================================
-- 2. listing_health_history — one row per collection per item
-- ============================================================
CREATE TABLE public.listing_health_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  window_days INTEGER NOT NULL DEFAULT 7,
  visits INTEGER,
  price NUMERIC,
  available_quantity INTEGER,
  listing_status TEXT,
  listing_type TEXT,
  shipping_mode TEXT,
  catalog_listing BOOLEAN,
  source TEXT DEFAULT 'api',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_health_history_collection UNIQUE (seller_id, item_id, collected_at, window_days)
);

CREATE INDEX idx_health_history_seller_item ON public.listing_health_history (seller_id, item_id);
CREATE INDEX idx_health_history_seller_collected ON public.listing_health_history (seller_id, collected_at DESC);
CREATE INDEX idx_health_history_seller_status ON public.listing_health_history (seller_id, listing_status);

-- ============================================================
-- 3. listing_health_current — latest state per item (upsert target)
-- ============================================================
CREATE TABLE public.listing_health_current (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  last_collected_at TIMESTAMPTZ,
  visits_last INTEGER,
  price NUMERIC,
  available_quantity INTEGER,
  listing_status TEXT,
  listing_type TEXT,
  shipping_mode TEXT,
  catalog_listing BOOLEAN,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_health_current_seller_item UNIQUE (seller_id, item_id)
);

CREATE INDEX idx_health_current_seller ON public.listing_health_current (seller_id);
CREATE INDEX idx_health_current_seller_status ON public.listing_health_current (seller_id, listing_status);

-- ============================================================
-- 4. radiography_backfill_control — resumable backfill per seller
-- ============================================================
CREATE TABLE public.radiography_backfill_control (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id TEXT NOT NULL,
  status public.radiography_backfill_status NOT NULL DEFAULT 'pending',
  progress_percent NUMERIC DEFAULT 0,
  last_processed_item_id TEXT,
  current_window_start TIMESTAMPTZ,
  current_window_end TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  error_message TEXT,
  CONSTRAINT uq_backfill_seller UNIQUE (seller_id)
);

-- ============================================================
-- 5. radiography_collection_logs — execution logs
-- ============================================================
CREATE TABLE public.radiography_collection_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id TEXT NOT NULL,
  job_type TEXT NOT NULL CHECK (job_type IN ('sync', 'collection', 'backfill')),
  total_items INTEGER DEFAULT 0,
  items_processed INTEGER DEFAULT 0,
  items_failed INTEGER DEFAULT 0,
  duration_ms INTEGER,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  error_message TEXT,
  metadata_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_collection_logs_seller_created ON public.radiography_collection_logs (seller_id, created_at DESC);
CREATE INDEX idx_collection_logs_type_status ON public.radiography_collection_logs (job_type, status);

-- ============================================================
-- 6. Adjust meli_listings_cache — add missing columns
-- ============================================================
ALTER TABLE public.meli_listings_cache
  ADD COLUMN IF NOT EXISTS shipping_mode TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_visit_collection_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_listings_cache_seller_status ON public.meli_listings_cache (seller_id, status);

-- ============================================================
-- 7. updated_at triggers
-- ============================================================
CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.listing_health_current
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.radiography_backfill_control
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.meli_listings_cache
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ============================================================
-- 8. RLS — Enable + Policies
-- ============================================================

-- listing_health_history
ALTER TABLE public.listing_health_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own health history" ON public.listing_health_history
  FOR SELECT TO authenticated
  USING (seller_id IN (SELECT seller_id FROM public.ml_accounts WHERE user_id = auth.uid()));

CREATE POLICY "Service role full access on health history" ON public.listing_health_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- listing_health_current
ALTER TABLE public.listing_health_current ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own health current" ON public.listing_health_current
  FOR SELECT TO authenticated
  USING (seller_id IN (SELECT seller_id FROM public.ml_accounts WHERE user_id = auth.uid()));

CREATE POLICY "Service role full access on health current" ON public.listing_health_current
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- radiography_backfill_control
ALTER TABLE public.radiography_backfill_control ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own backfill control" ON public.radiography_backfill_control
  FOR SELECT TO authenticated
  USING (seller_id IN (SELECT seller_id FROM public.ml_accounts WHERE user_id = auth.uid()));

CREATE POLICY "Service role full access on backfill control" ON public.radiography_backfill_control
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- radiography_collection_logs
ALTER TABLE public.radiography_collection_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own collection logs" ON public.radiography_collection_logs
  FOR SELECT TO authenticated
  USING (seller_id IN (SELECT seller_id FROM public.ml_accounts WHERE user_id = auth.uid()));

CREATE POLICY "Service role full access on collection logs" ON public.radiography_collection_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
