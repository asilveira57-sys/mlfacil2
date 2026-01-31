-- =====================================================
-- FREIGHT MANAGEMENT SYSTEM - COMPLETE
-- =====================================================

-- A) freight_rulesets: Regras de frete versionadas
CREATE TABLE public.freight_rulesets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  marketplace TEXT NOT NULL DEFAULT 'mercadolivre',
  country TEXT NOT NULL DEFAULT 'BR',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'draft')),
  valid_from DATE NOT NULL,
  valid_until DATE,
  description TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- B) freight_rule_lines: Linhas da tabela de frete
CREATE TABLE public.freight_rule_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ruleset_id UUID NOT NULL REFERENCES public.freight_rulesets(id) ON DELETE CASCADE,
  logistic_mode TEXT NOT NULL,
  ad_type TEXT NOT NULL DEFAULT 'premium',
  price_band_min NUMERIC NOT NULL DEFAULT 0,
  price_band_max NUMERIC,
  weight_min NUMERIC NOT NULL DEFAULT 0,
  weight_max NUMERIC,
  dimensions_limit_policy TEXT,
  dimensions_limit_value NUMERIC,
  seller_pays_value NUMERIC NOT NULL DEFAULT 0,
  seller_pays_formula TEXT,
  subsidy_type TEXT NOT NULL DEFAULT 'none' CHECK (subsidy_type IN ('none', 'partial', 'full')),
  subsidy_value NUMERIC DEFAULT 0,
  is_free_shipping BOOLEAN DEFAULT false,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- C) Estender meli_listings_cache
ALTER TABLE public.meli_listings_cache 
ADD COLUMN IF NOT EXISTS weight_kg NUMERIC,
ADD COLUMN IF NOT EXISTS height_cm NUMERIC,
ADD COLUMN IF NOT EXISTS width_cm NUMERIC,
ADD COLUMN IF NOT EXISTS length_cm NUMERIC,
ADD COLUMN IF NOT EXISTS dimensions_source TEXT DEFAULT 'none',
ADD COLUMN IF NOT EXISTS freight_profile TEXT DEFAULT 'B',
ADD COLUMN IF NOT EXISTS expected_freight_cost NUMERIC,
ADD COLUMN IF NOT EXISTS expected_freight_ruleset_id UUID,
ADD COLUMN IF NOT EXISTS expected_freight_updated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS freight_calculation_notes TEXT;

-- D) freight_divergence_log
CREATE TABLE public.freight_divergence_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  variation_id TEXT DEFAULT '',
  order_date DATE NOT NULL,
  charged_shipping_value NUMERIC,
  paid_shipping_value NUMERIC,
  expected_shipping_value NUMERIC,
  shipping_diff_value NUMERIC,
  shipping_diff_percent NUMERIC,
  shipping_flag TEXT NOT NULL DEFAULT 'pending' CHECK (shipping_flag IN ('ok', 'divergent', 'pending', 'manual_ok')),
  ruleset_id UUID,
  logistic_mode TEXT,
  ad_type TEXT,
  product_weight NUMERIC,
  product_price NUMERIC,
  divergence_reason TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID,
  resolution_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- E) freight_bulk_jobs
CREATE TABLE public.freight_bulk_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  job_type TEXT NOT NULL DEFAULT 'recalculate',
  filters JSONB,
  ruleset_id UUID,
  context_config JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  total_items INTEGER DEFAULT 0,
  processed_items INTEGER DEFAULT 0,
  updated_items INTEGER DEFAULT 0,
  skipped_items INTEGER DEFAULT 0,
  error_items INTEGER DEFAULT 0,
  error_details JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- F) freight_settings
CREATE TABLE public.freight_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  active_ruleset_id UUID,
  tolerance_value NUMERIC DEFAULT 5.00,
  tolerance_percent NUMERIC DEFAULT 10.0,
  comparison_mode TEXT DEFAULT 'paid_vs_expected' CHECK (comparison_mode IN ('paid_vs_expected', 'charged_vs_expected', 'both')),
  profile_a_weight_max NUMERIC DEFAULT 0.5,
  profile_a_dimensions_sum NUMERIC DEFAULT 60,
  profile_b_weight_max NUMERIC DEFAULT 5,
  profile_b_dimensions_sum NUMERIC DEFAULT 150,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, seller_id)
);

-- Índices
CREATE INDEX idx_freight_rule_lines_ruleset ON public.freight_rule_lines(ruleset_id);
CREATE INDEX idx_freight_rule_lines_lookup ON public.freight_rule_lines(ruleset_id, logistic_mode, ad_type);
CREATE INDEX idx_freight_divergence_seller ON public.freight_divergence_log(seller_id, order_date);
CREATE INDEX idx_freight_divergence_flag ON public.freight_divergence_log(shipping_flag, seller_id);

-- RLS
ALTER TABLE public.freight_rulesets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freight_rule_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freight_divergence_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freight_bulk_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freight_settings ENABLE ROW LEVEL SECURITY;

-- Políticas Rulesets (públicos para leitura)
CREATE POLICY "Rulesets are viewable by authenticated" ON public.freight_rulesets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Rulesets can be created" ON public.freight_rulesets FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- Políticas Rule Lines
CREATE POLICY "Rule lines are viewable" ON public.freight_rule_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Rule lines can be created" ON public.freight_rule_lines FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- Políticas Divergence Log
CREATE POLICY "View own divergence logs" ON public.freight_divergence_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Insert own divergence logs" ON public.freight_divergence_log FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Update own divergence logs" ON public.freight_divergence_log FOR UPDATE USING (auth.uid() = user_id);

-- Políticas Bulk Jobs
CREATE POLICY "View own bulk jobs" ON public.freight_bulk_jobs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Create own bulk jobs" ON public.freight_bulk_jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Update own bulk jobs" ON public.freight_bulk_jobs FOR UPDATE USING (auth.uid() = user_id);

-- Políticas Settings
CREATE POLICY "View own freight settings" ON public.freight_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Manage own freight settings" ON public.freight_settings FOR ALL USING (auth.uid() = user_id);

-- Função para updated_at
CREATE OR REPLACE FUNCTION public.update_freight_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers
CREATE TRIGGER update_freight_rulesets_updated_at BEFORE UPDATE ON public.freight_rulesets FOR EACH ROW EXECUTE FUNCTION public.update_freight_updated_at();
CREATE TRIGGER update_freight_divergence_updated_at BEFORE UPDATE ON public.freight_divergence_log FOR EACH ROW EXECUTE FUNCTION public.update_freight_updated_at();
CREATE TRIGGER update_freight_settings_updated_at BEFORE UPDATE ON public.freight_settings FOR EACH ROW EXECUTE FUNCTION public.update_freight_updated_at();