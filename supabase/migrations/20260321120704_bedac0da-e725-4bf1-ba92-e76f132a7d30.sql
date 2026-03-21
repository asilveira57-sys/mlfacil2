
-- ============================================================
-- FASE 1 — FUNDAÇÃO DE DADOS PARA RADIOGRAFIA
-- ============================================================

-- 1. EXPANDIR listing_health_current
ALTER TABLE listing_health_current
  ADD COLUMN IF NOT EXISTS catalog_product_id text,
  ADD COLUMN IF NOT EXISTS logistic_type text,
  ADD COLUMN IF NOT EXISTS free_shipping boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS photos_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS has_video boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS thumbnail text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS permalink text,
  ADD COLUMN IF NOT EXISTS visits_7d integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS visits_30d integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS visits_60d integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sales_count_60d integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS units_sold_60d integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conversion_rate_30d numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revenue_30d numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revenue_60d numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS health_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS health_status text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS main_problem text,
  ADD COLUMN IF NOT EXISTS data_coverage_days integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS data_coverage_status text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

-- 2. EXPANDIR listing_health_history
ALTER TABLE listing_health_history
  ADD COLUMN IF NOT EXISTS health_score numeric,
  ADD COLUMN IF NOT EXISTS health_status text,
  ADD COLUMN IF NOT EXISTS conversion_rate numeric,
  ADD COLUMN IF NOT EXISTS revenue numeric,
  ADD COLUMN IF NOT EXISTS photos_count integer,
  ADD COLUMN IF NOT EXISTS has_video boolean,
  ADD COLUMN IF NOT EXISTS logistic_type text,
  ADD COLUMN IF NOT EXISTS free_shipping boolean,
  ADD COLUMN IF NOT EXISTS catalog_product_id text,
  ADD COLUMN IF NOT EXISTS window_start timestamp with time zone,
  ADD COLUMN IF NOT EXISTS window_end timestamp with time zone;

-- 3. NOVAS TABELAS

-- 3a. Recomendações por anúncio
CREATE TABLE IF NOT EXISTS listing_health_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id text NOT NULL,
  item_id text NOT NULL,
  tenant_id uuid,
  recommendation_type text NOT NULL,
  priority text NOT NULL DEFAULT 'medium',
  title text NOT NULL,
  description text NOT NULL,
  category text,
  estimated_impact text,
  status text NOT NULL DEFAULT 'pending',
  dismissed_at timestamp with time zone,
  applied_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 3b. Alertas por anúncio
CREATE TABLE IF NOT EXISTS listing_health_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id text NOT NULL,
  item_id text NOT NULL,
  tenant_id uuid,
  alert_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  message text NOT NULL,
  data_json jsonb,
  is_read boolean NOT NULL DEFAULT false,
  is_resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 3c. Análise de mídia
CREATE TABLE IF NOT EXISTS listing_media_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id text NOT NULL,
  item_id text NOT NULL,
  tenant_id uuid,
  photos_count integer DEFAULT 0,
  has_video boolean DEFAULT false,
  photo_urls text[],
  video_url text,
  quality_score numeric,
  analysis_json jsonb,
  analyzed_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 3d. Regras de saúde
CREATE TABLE IF NOT EXISTS listing_health_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key text NOT NULL UNIQUE,
  rule_name text NOT NULL,
  description text,
  category text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  condition_json jsonb NOT NULL,
  recommendation_template text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 3e. Logs do engine
CREATE TABLE IF NOT EXISTS listing_health_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id text,
  item_id text,
  tenant_id uuid,
  log_type text NOT NULL,
  log_level text NOT NULL DEFAULT 'info',
  action text NOT NULL,
  message text,
  metadata_json jsonb,
  duration_ms integer,
  items_processed integer,
  errors_count integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 4. ÍNDICES

-- listing_health_current extras
CREATE INDEX IF NOT EXISTS idx_lhc_health_score ON listing_health_current (seller_id, health_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_lhc_health_status ON listing_health_current (seller_id, health_status);
CREATE INDEX IF NOT EXISTS idx_lhc_main_problem ON listing_health_current (seller_id, main_problem) WHERE main_problem IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lhc_catalog ON listing_health_current (seller_id, catalog_listing);
CREATE INDEX IF NOT EXISTS idx_lhc_logistic ON listing_health_current (seller_id, logistic_type) WHERE logistic_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lhc_tenant ON listing_health_current (tenant_id) WHERE tenant_id IS NOT NULL;

-- listing_health_history extras
CREATE INDEX IF NOT EXISTS idx_lhh_item_collected ON listing_health_history (item_id, collected_at DESC);

-- recommendations
CREATE INDEX IF NOT EXISTS idx_lhr_seller_item ON listing_health_recommendations (seller_id, item_id);
CREATE INDEX IF NOT EXISTS idx_lhr_seller_status ON listing_health_recommendations (seller_id, status);
CREATE INDEX IF NOT EXISTS idx_lhr_tenant ON listing_health_recommendations (tenant_id) WHERE tenant_id IS NOT NULL;

-- alerts
CREATE INDEX IF NOT EXISTS idx_lha_seller_item ON listing_health_alerts (seller_id, item_id);
CREATE INDEX IF NOT EXISTS idx_lha_seller_unread ON listing_health_alerts (seller_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_lha_tenant ON listing_health_alerts (tenant_id) WHERE tenant_id IS NOT NULL;

-- media analysis
CREATE INDEX IF NOT EXISTS idx_lma_seller_item ON listing_media_analysis (seller_id, item_id);

-- logs
CREATE INDEX IF NOT EXISTS idx_lhl_seller ON listing_health_logs (seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lhl_type ON listing_health_logs (log_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lhl_tenant ON listing_health_logs (tenant_id, created_at DESC) WHERE tenant_id IS NOT NULL;

-- 5. RLS

ALTER TABLE listing_health_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_health_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_media_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_health_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_health_logs ENABLE ROW LEVEL SECURITY;

-- Service role write
CREATE POLICY "service_write_recommendations" ON listing_health_recommendations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_write_alerts" ON listing_health_alerts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_write_media" ON listing_media_analysis FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_write_rules" ON listing_health_rules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_write_logs" ON listing_health_logs FOR ALL USING (true) WITH CHECK (true);

-- User read via seller_id -> ml_accounts
CREATE POLICY "user_read_recommendations" ON listing_health_recommendations FOR SELECT
  USING (seller_id IN (SELECT ml_user_id FROM ml_accounts WHERE user_id = auth.uid()));

CREATE POLICY "user_read_alerts" ON listing_health_alerts FOR SELECT
  USING (seller_id IN (SELECT ml_user_id FROM ml_accounts WHERE user_id = auth.uid()));

CREATE POLICY "user_read_media" ON listing_media_analysis FOR SELECT
  USING (seller_id IN (SELECT ml_user_id FROM ml_accounts WHERE user_id = auth.uid()));

CREATE POLICY "anyone_read_rules" ON listing_health_rules FOR SELECT USING (true);

CREATE POLICY "user_read_logs" ON listing_health_logs FOR SELECT
  USING (seller_id IN (SELECT ml_user_id FROM ml_accounts WHERE user_id = auth.uid()));

-- Admin read all
CREATE POLICY "admin_read_all_recommendations" ON listing_health_recommendations FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin_read_all_alerts" ON listing_health_alerts FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin_read_all_media" ON listing_media_analysis FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin_read_all_logs" ON listing_health_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- 6. SEED: regras padrão
INSERT INTO listing_health_rules (rule_key, rule_name, category, severity, condition_json, recommendation_template) VALUES
  ('no_photos', 'Sem fotos', 'media', 'critical', '{"field":"photos_count","op":"eq","value":0}', 'Adicione fotos ao anúncio para melhorar visibilidade'),
  ('few_photos', 'Poucas fotos', 'media', 'warning', '{"field":"photos_count","op":"lt","value":4}', 'Adicione mais fotos (mínimo recomendado: 6)'),
  ('no_video', 'Sem vídeo', 'media', 'info', '{"field":"has_video","op":"eq","value":false}', 'Considere adicionar um vídeo ao anúncio'),
  ('no_catalog', 'Fora do catálogo', 'catalog', 'warning', '{"field":"catalog_listing","op":"eq","value":false}', 'Vincule ao catálogo para ganhar exposição'),
  ('low_stock', 'Estoque baixo', 'stock', 'warning', '{"field":"available_quantity","op":"lt","value":3}', 'Reponha estoque para evitar perda de vendas'),
  ('zero_stock', 'Sem estoque', 'stock', 'critical', '{"field":"available_quantity","op":"eq","value":0}', 'Anúncio pausado por falta de estoque'),
  ('no_full', 'Sem fulfillment', 'logistics', 'info', '{"field":"logistic_type","op":"neq","value":"fulfillment"}', 'Considere usar Full para melhorar conversão'),
  ('low_visits', 'Poucas visitas', 'traffic', 'warning', '{"field":"visits_30d","op":"lt","value":30}', 'Anúncio com baixo tráfego — revise título e fotos'),
  ('high_inactivity', 'Inatividade alta', 'sales', 'critical', '{"field":"days_without_sale","op":"gt","value":30}', 'Sem vendas há mais de 30 dias — avaliar ação urgente'),
  ('low_conversion', 'Conversão baixa', 'conversion', 'warning', '{"field":"conversion_rate_30d","op":"lt","value":1}', 'Conversão abaixo de 1% — revise preço e fotos')
ON CONFLICT (rule_key) DO NOTHING;
