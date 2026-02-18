
-- =============================================
-- Tabela: competitor_sellers
-- =============================================
CREATE TABLE public.competitor_sellers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  ml_seller_id TEXT NOT NULL,
  ml_nickname TEXT,
  user_alias TEXT,
  seller_reputation JSONB,
  total_items_tracked INT DEFAULT 0,
  last_synced_at TIMESTAMPTZ,
  next_sync_at TIMESTAMPTZ,
  sync_interval_hours INT DEFAULT 6,
  status TEXT DEFAULT 'ativo',
  binding_date TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint
CREATE UNIQUE INDEX idx_competitor_sellers_unique ON public.competitor_sellers (user_id, seller_id, ml_seller_id);
CREATE INDEX idx_competitor_sellers_next_sync ON public.competitor_sellers (next_sync_at) WHERE status = 'ativo';

ALTER TABLE public.competitor_sellers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own competitor sellers"
  ON public.competitor_sellers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own competitor sellers"
  ON public.competitor_sellers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own competitor sellers"
  ON public.competitor_sellers FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own competitor sellers"
  ON public.competitor_sellers FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_competitor_sellers_updated_at
  BEFORE UPDATE ON public.competitor_sellers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- Tabela: competitor_seller_items
-- =============================================
CREATE TABLE public.competitor_seller_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  competitor_seller_id UUID NOT NULL REFERENCES public.competitor_sellers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  item_id TEXT NOT NULL,
  title TEXT,
  thumbnail TEXT,
  price NUMERIC,
  original_price NUMERIC,
  currency_id TEXT DEFAULT 'BRL',
  sold_quantity_ref INT DEFAULT 0,
  available_qty_ref INT DEFAULT 0,
  category_id TEXT,
  listing_type TEXT,
  condition TEXT,
  status TEXT DEFAULT 'active',
  permalink TEXT,
  free_shipping BOOLEAN DEFAULT false,
  catalog_listing BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_competitor_seller_items_unique ON public.competitor_seller_items (competitor_seller_id, item_id);
CREATE INDEX idx_competitor_seller_items_seller ON public.competitor_seller_items (competitor_seller_id);

ALTER TABLE public.competitor_seller_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own competitor seller items"
  ON public.competitor_seller_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own competitor seller items"
  ON public.competitor_seller_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own competitor seller items"
  ON public.competitor_seller_items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own competitor seller items"
  ON public.competitor_seller_items FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_competitor_seller_items_updated_at
  BEFORE UPDATE ON public.competitor_seller_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- Tabela: competitor_seller_item_snapshots
-- =============================================
CREATE TABLE public.competitor_seller_item_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id TEXT NOT NULL,
  competitor_seller_id UUID NOT NULL REFERENCES public.competitor_sellers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  price NUMERIC,
  sold_quantity_ref INT DEFAULT 0,
  available_qty_ref INT DEFAULT 0,
  status TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_competitor_snapshots_item ON public.competitor_seller_item_snapshots (competitor_seller_id, item_id, captured_at DESC);

ALTER TABLE public.competitor_seller_item_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own snapshots"
  ON public.competitor_seller_item_snapshots FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own snapshots"
  ON public.competitor_seller_item_snapshots FOR INSERT
  WITH CHECK (auth.uid() = user_id);
