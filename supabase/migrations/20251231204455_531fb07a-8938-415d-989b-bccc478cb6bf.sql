-- =====================================================
-- MÓDULO TENDÊNCIAS - ESTRUTURA COMPLETA DO BANCO
-- =====================================================

-- 1. TABELA DE FEATURE FLAGS (PERMISSÕES LOCAIS DO MÓDULO)
CREATE TABLE IF NOT EXISTS public.user_feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, feature_key)
);

ALTER TABLE public.user_feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_feature_flags_all" ON public.user_feature_flags
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. REGISTRO DE MÓDULOS (PARA PAINEL FUTURO)
CREATE TABLE IF NOT EXISTS public.modules_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  icon TEXT,
  route TEXT,
  show_in_panel BOOLEAN DEFAULT true,
  default_visible BOOLEAN DEFAULT true,
  order_default INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.modules_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "modules_registry_select_all" ON public.modules_registry
  FOR SELECT USING (true);

-- 3. TREND SNAPSHOTS (DADOS PÚBLICOS DE TENDÊNCIAS)
CREATE TABLE IF NOT EXISTS public.trend_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id TEXT NOT NULL DEFAULT 'MLB',
  category_id TEXT,
  snapshot_date DATE NOT NULL,
  trends_data JSONB,
  keywords_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(site_id, category_id, snapshot_date)
);

ALTER TABLE public.trend_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trend_snapshots_select_all" ON public.trend_snapshots
  FOR SELECT USING (true);

CREATE POLICY "trend_snapshots_insert_authenticated" ON public.trend_snapshots
  FOR INSERT WITH CHECK (true);

CREATE INDEX idx_trend_snapshots_site_date ON public.trend_snapshots(site_id, snapshot_date DESC);
CREATE INDEX idx_trend_snapshots_category ON public.trend_snapshots(category_id, snapshot_date DESC);

-- 4. HIGHLIGHTS SNAPSHOTS (MAIS VENDIDOS POR CATEGORIA)
CREATE TABLE IF NOT EXISTS public.highlights_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id TEXT NOT NULL DEFAULT 'MLB',
  category_id TEXT NOT NULL,
  snapshot_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(site_id, category_id, snapshot_date)
);

ALTER TABLE public.highlights_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "highlights_snapshots_select_all" ON public.highlights_snapshots
  FOR SELECT USING (true);

CREATE POLICY "highlights_snapshots_insert_authenticated" ON public.highlights_snapshots
  FOR INSERT WITH CHECK (true);

CREATE INDEX idx_highlights_snapshots_category_date ON public.highlights_snapshots(category_id, snapshot_date DESC);

-- 5. HIGHLIGHTS ITEMS (ITENS DOS MAIS VENDIDOS)
CREATE TABLE IF NOT EXISTS public.highlights_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES public.highlights_snapshots(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  title TEXT,
  thumbnail TEXT,
  price NUMERIC,
  sold_quantity INTEGER,
  permalink TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.highlights_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "highlights_items_select_all" ON public.highlights_items
  FOR SELECT USING (true);

CREATE POLICY "highlights_items_insert_authenticated" ON public.highlights_items
  FOR INSERT WITH CHECK (true);

CREATE INDEX idx_highlights_items_snapshot ON public.highlights_items(snapshot_id);
CREATE INDEX idx_highlights_items_item ON public.highlights_items(item_id);

-- 6. SELLER ITEM VISITS (VISITAS POR ITEM DO SELLER)
CREATE TABLE IF NOT EXISTS public.seller_item_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  visit_date DATE NOT NULL,
  visits_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(seller_id, item_id, visit_date)
);

ALTER TABLE public.seller_item_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seller_item_visits_all" ON public.seller_item_visits
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_seller_item_visits_seller_date ON public.seller_item_visits(seller_id, visit_date DESC);
CREATE INDEX idx_seller_item_visits_item ON public.seller_item_visits(item_id, visit_date DESC);

-- 7. SELLER ITEM SALES DAILY (VENDAS DIÁRIAS POR ITEM)
CREATE TABLE IF NOT EXISTS public.seller_item_sales_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  sale_date DATE NOT NULL,
  quantity_sold INTEGER NOT NULL DEFAULT 0,
  revenue NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(seller_id, item_id, sale_date)
);

ALTER TABLE public.seller_item_sales_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seller_item_sales_daily_all" ON public.seller_item_sales_daily
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_seller_item_sales_daily_seller_date ON public.seller_item_sales_daily(seller_id, sale_date DESC);
CREATE INDEX idx_seller_item_sales_daily_item ON public.seller_item_sales_daily(item_id, sale_date DESC);

-- 8. SELLER ITEM SALES MONTHLY (VENDAS MENSAIS AGREGADAS)
CREATE TABLE IF NOT EXISTS public.seller_item_sales_monthly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  sale_month DATE NOT NULL, -- Primeiro dia do mês
  quantity_sold INTEGER NOT NULL DEFAULT 0,
  revenue NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(seller_id, item_id, sale_month)
);

ALTER TABLE public.seller_item_sales_monthly ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seller_item_sales_monthly_all" ON public.seller_item_sales_monthly
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_seller_item_sales_monthly_seller ON public.seller_item_sales_monthly(seller_id, sale_month DESC);
CREATE INDEX idx_seller_item_sales_monthly_item ON public.seller_item_sales_monthly(item_id, sale_month DESC);

-- 9. MONTHLY RANKINGS (RANKINGS MENSAIS CONSOLIDADOS)
CREATE TABLE IF NOT EXISTS public.monthly_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL,
  ranking_month DATE NOT NULL,
  ranking_type TEXT NOT NULL, -- 'visits', 'sales_quantity', 'sales_revenue'
  rankings JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(seller_id, ranking_month, ranking_type)
);

ALTER TABLE public.monthly_rankings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "monthly_rankings_all" ON public.monthly_rankings
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_monthly_rankings_seller_month ON public.monthly_rankings(seller_id, ranking_month DESC);

-- 10. ALERTS (ALERTAS DO MÓDULO)
CREATE TABLE IF NOT EXISTS public.trend_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL,
  alert_type TEXT NOT NULL, -- 'sales_spike', 'visits_spike', 'sales_drop', 'visits_drop'
  item_id TEXT,
  title TEXT NOT NULL,
  message TEXT,
  severity TEXT NOT NULL DEFAULT 'info', -- 'info', 'warning', 'critical'
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  alert_data JSONB,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.trend_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trend_alerts_all" ON public.trend_alerts
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_trend_alerts_seller_unread ON public.trend_alerts(seller_id, is_read, is_dismissed, triggered_at DESC);
CREATE INDEX idx_trend_alerts_item ON public.trend_alerts(item_id, triggered_at DESC);

-- 11. TREND MODULE SETTINGS (CONFIGURAÇÕES DO MÓDULO)
CREATE TABLE IF NOT EXISTS public.trend_module_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL,
  alerts_enabled BOOLEAN NOT NULL DEFAULT true,
  sales_spike_threshold NUMERIC NOT NULL DEFAULT 50, -- % aumento para alerta
  visits_spike_threshold NUMERIC NOT NULL DEFAULT 100, -- % aumento para alerta
  favorite_categories TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, seller_id)
);

ALTER TABLE public.trend_module_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trend_module_settings_all" ON public.trend_module_settings
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 12. INSERIR REGISTRO DO MÓDULO
INSERT INTO public.modules_registry (module_key, name, icon, route, show_in_panel, default_visible, order_default)
VALUES ('tendencias', 'Tendências', 'trending_up', '/tendencias', true, true, 30)
ON CONFLICT (module_key) DO NOTHING;

-- 13. TRIGGER PARA UPDATED_AT
CREATE OR REPLACE FUNCTION public.update_trend_tables_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_user_feature_flags_updated_at
  BEFORE UPDATE ON public.user_feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_trend_tables_updated_at();

CREATE TRIGGER update_seller_item_sales_monthly_updated_at
  BEFORE UPDATE ON public.seller_item_sales_monthly
  FOR EACH ROW EXECUTE FUNCTION public.update_trend_tables_updated_at();

CREATE TRIGGER update_trend_module_settings_updated_at
  BEFORE UPDATE ON public.trend_module_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_trend_tables_updated_at();