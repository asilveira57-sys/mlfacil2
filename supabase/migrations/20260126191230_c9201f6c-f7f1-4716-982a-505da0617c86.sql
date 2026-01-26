-- =============================================
-- MÓDULO MERCADO ADS: Tabelas de Publicidade
-- =============================================

-- Campanhas de ADS
CREATE TABLE public.ads_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  ml_campaign_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  campaign_type TEXT,
  daily_budget NUMERIC(12,2),
  total_budget NUMERIC(12,2),
  spent_total NUMERIC(12,2) DEFAULT 0,
  start_date DATE,
  end_date DATE,
  raw_data JSONB,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(seller_id, ml_campaign_id)
);

-- Grupos de anúncios
CREATE TABLE public.ads_ad_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  campaign_id UUID REFERENCES public.ads_campaigns(id) ON DELETE CASCADE,
  ml_ad_group_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  default_bid NUMERIC(10,2),
  spent NUMERIC(12,2) DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  raw_data JSONB,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(seller_id, ml_ad_group_id)
);

-- Anúncios / Produtos em ADS
CREATE TABLE public.ads_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  ad_group_id UUID REFERENCES public.ads_ad_groups(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  product_key TEXT,
  title TEXT,
  category_id TEXT,
  current_price NUMERIC(12,2),
  status TEXT NOT NULL DEFAULT 'active',
  bid NUMERIC(10,2),
  spent NUMERIC(12,2) DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  revenue_from_ads NUMERIC(12,2) DEFAULT 0,
  acos NUMERIC(8,4),
  roas NUMERIC(8,4),
  raw_data JSONB,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(seller_id, item_id, ad_group_id)
);

-- Métricas diárias consolidadas
CREATE TABLE public.ads_daily_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  metric_date DATE NOT NULL,
  campaign_id UUID NOT NULL REFERENCES public.ads_campaigns(id) ON DELETE CASCADE,
  ad_group_id UUID REFERENCES public.ads_ad_groups(id) ON DELETE SET NULL,
  item_id TEXT,
  spent NUMERIC(12,2) DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  revenue NUMERIC(12,2) DEFAULT 0,
  acos NUMERIC(8,4),
  roas NUMERIC(8,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice único para métricas diárias (abordagem simplificada)
CREATE UNIQUE INDEX idx_ads_daily_metrics_unique 
  ON public.ads_daily_metrics(seller_id, metric_date, campaign_id, ad_group_id, item_id)
  WHERE ad_group_id IS NOT NULL AND item_id IS NOT NULL;

CREATE UNIQUE INDEX idx_ads_daily_metrics_unique_no_item 
  ON public.ads_daily_metrics(seller_id, metric_date, campaign_id, ad_group_id)
  WHERE ad_group_id IS NOT NULL AND item_id IS NULL;

CREATE UNIQUE INDEX idx_ads_daily_metrics_unique_campaign_only 
  ON public.ads_daily_metrics(seller_id, metric_date, campaign_id)
  WHERE ad_group_id IS NULL AND item_id IS NULL;

-- Alertas de ADS
CREATE TABLE public.ads_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  title TEXT NOT NULL,
  message_pt TEXT NOT NULL,
  campaign_id UUID REFERENCES public.ads_campaigns(id) ON DELETE CASCADE,
  item_id TEXT,
  data_json JSONB,
  is_read BOOLEAN DEFAULT false,
  is_dismissed BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Regras de automação de ADS
CREATE TABLE public.ads_automation_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  name TEXT NOT NULL,
  description TEXT,
  rule_type TEXT NOT NULL,
  conditions JSONB NOT NULL DEFAULT '{}',
  actions JSONB NOT NULL DEFAULT '{}',
  is_enabled BOOLEAN DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  trigger_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Estado de sincronização de ADS
CREATE TABLE public.ads_sync_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  campaigns_synced INTEGER DEFAULT 0,
  items_synced INTEGER DEFAULT 0,
  next_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, seller_id)
);

-- Índices para performance
CREATE INDEX idx_ads_campaigns_seller ON public.ads_campaigns(seller_id, status);
CREATE INDEX idx_ads_campaigns_workspace ON public.ads_campaigns(workspace_id);
CREATE INDEX idx_ads_ad_groups_campaign ON public.ads_ad_groups(campaign_id);
CREATE INDEX idx_ads_items_seller ON public.ads_items(seller_id, item_id);
CREATE INDEX idx_ads_items_ad_group ON public.ads_items(ad_group_id);
CREATE INDEX idx_ads_daily_metrics_date ON public.ads_daily_metrics(seller_id, metric_date);
CREATE INDEX idx_ads_alerts_seller ON public.ads_alerts(seller_id, is_read, is_dismissed);
CREATE INDEX idx_ads_alerts_workspace ON public.ads_alerts(workspace_id);

-- Enable RLS
ALTER TABLE public.ads_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_ad_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_sync_state ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own ads campaigns" ON public.ads_campaigns FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ads campaigns" ON public.ads_campaigns FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ads campaigns" ON public.ads_campaigns FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own ads campaigns" ON public.ads_campaigns FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own ad groups" ON public.ads_ad_groups FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ad groups" ON public.ads_ad_groups FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ad groups" ON public.ads_ad_groups FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own ad groups" ON public.ads_ad_groups FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own ads items" ON public.ads_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ads items" ON public.ads_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ads items" ON public.ads_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own ads items" ON public.ads_items FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own ads metrics" ON public.ads_daily_metrics FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ads metrics" ON public.ads_daily_metrics FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own ads alerts" ON public.ads_alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ads alerts" ON public.ads_alerts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ads alerts" ON public.ads_alerts FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own ads rules" ON public.ads_automation_rules FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ads rules" ON public.ads_automation_rules FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ads rules" ON public.ads_automation_rules FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own ads rules" ON public.ads_automation_rules FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own ads sync state" ON public.ads_sync_state FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own ads sync state" ON public.ads_sync_state FOR ALL USING (auth.uid() = user_id);

-- Triggers
CREATE TRIGGER update_ads_campaigns_updated_at BEFORE UPDATE ON public.ads_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ads_ad_groups_updated_at BEFORE UPDATE ON public.ads_ad_groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ads_items_updated_at BEFORE UPDATE ON public.ads_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ads_automation_rules_updated_at BEFORE UPDATE ON public.ads_automation_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ads_sync_state_updated_at BEFORE UPDATE ON public.ads_sync_state FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.ads_alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ads_campaigns;