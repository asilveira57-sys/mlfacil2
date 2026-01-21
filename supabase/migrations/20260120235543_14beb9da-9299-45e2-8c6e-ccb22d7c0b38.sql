-- =====================================================
-- RADIOGRAFIA DE ANÚNCIOS - Estrutura de Dados
-- =====================================================

-- 1. Snapshots periódicos de anúncios (monitoramento passivo)
CREATE TABLE public.listing_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Estado do anúncio
  title TEXT,
  title_length INT,
  description_length INT,
  price NUMERIC(12,2),
  original_price NUMERIC(12,2),
  available_quantity INT,
  sold_quantity INT,
  status TEXT,
  
  -- Atributos de qualidade
  photo_count INT DEFAULT 0,
  has_video BOOLEAN DEFAULT false,
  has_clip BOOLEAN DEFAULT false,
  attributes_count INT DEFAULT 0,
  listing_type_id TEXT,
  logistic_type TEXT,
  catalog_product_id TEXT,
  health INT,
  
  -- Métricas de performance (últimos 7 dias)
  visits_7d INT DEFAULT 0,
  sales_7d INT DEFAULT 0,
  conversion_rate_7d NUMERIC(5,2) DEFAULT 0,
  
  -- Score resumido (calculado automaticamente)
  score_semantica INT DEFAULT 0,
  score_visual INT DEFAULT 0,
  score_clip INT DEFAULT 0,
  score_competitividade INT DEFAULT 0,
  score_logistica INT DEFAULT 0,
  score_performance INT DEFAULT 0,
  score_total INT DEFAULT 0,
  
  -- Metadata
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT listing_snapshots_unique UNIQUE(seller_id, item_id, snapshot_date)
);

-- 2. Eventos detectados (imutáveis após criação)
CREATE TABLE public.listing_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  
  -- Classificação do evento
  event_type TEXT NOT NULL, -- title_changed, price_changed, stockout, etc.
  event_category TEXT NOT NULL, -- content, traffic, stock, campaign, ads, logistics, catalog
  origin TEXT NOT NULL, -- notification, snapshot, inference
  severity TEXT DEFAULT 'info', -- info, warning, critical
  
  -- Estado antes/depois
  state_before JSONB,
  state_after JSONB,
  
  -- Impacto no score
  blocks_affected TEXT[] DEFAULT '{}', -- ['semantica', 'visual', 'performance']
  score_before JSONB, -- {semantica: 70, visual: 80, ...}
  score_after JSONB,
  score_delta JSONB, -- {semantica: -5, performance: -10}
  impact_direction TEXT, -- positive, negative, neutral
  
  -- Interpretação
  observation_pt TEXT, -- "Mudança de título pode impactar CTR"
  
  -- Metadata
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  snapshot_id UUID REFERENCES listing_snapshots(id),
  is_processed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Radiografia detalhada (gerada sob demanda)
CREATE TABLE public.listing_radiography (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  
  -- Análise profunda
  analysis_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  period_analyzed_days INT DEFAULT 90,
  
  -- Scores detalhados por bloco
  score_breakdown JSONB, -- {semantica: {score: 75, details: {...}}, ...}
  
  -- Narrativa interpretativa
  narrative_pt TEXT, -- "A venda cresceu após entrada no Full..."
  period_summary TEXT, -- "crescimento", "estagnação", "queda", "recuperação"
  
  -- Ações sugeridas (priorizadas)
  suggested_actions JSONB, -- [{priority: 1, action: "Melhorar título", impact: "alto"}, ...]
  
  -- Eventos agrupados por período
  event_timeline JSONB, -- [{period: "Jan 2025", events: [...], trend: "up"}]
  
  -- Insights de causa/efeito
  cause_effect_insights JSONB, -- [{cause: "Ruptura Full", effect: "Queda vendas 40%", period: "..."}]
  
  -- Metadata
  is_current BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Configuração de monitoramento por seller
CREATE TABLE public.listing_monitor_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  
  -- Configurações
  auto_monitor_enabled BOOLEAN DEFAULT true,
  snapshot_frequency_hours INT DEFAULT 24,
  alert_on_critical BOOLEAN DEFAULT true,
  
  -- Filtros
  monitor_active_only BOOLEAN DEFAULT true,
  min_sales_to_monitor INT DEFAULT 0,
  
  -- Estado
  last_snapshot_at TIMESTAMPTZ,
  total_items_monitored INT DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_listing_snapshots_seller_item ON listing_snapshots(seller_id, item_id);
CREATE INDEX idx_listing_snapshots_date ON listing_snapshots(snapshot_date DESC);
CREATE INDEX idx_listing_events_seller_item ON listing_events(seller_id, item_id);
CREATE INDEX idx_listing_events_type ON listing_events(event_type);
CREATE INDEX idx_listing_events_detected ON listing_events(detected_at DESC);
CREATE INDEX idx_listing_radiography_seller_item ON listing_radiography(seller_id, item_id);
CREATE INDEX idx_listing_radiography_current ON listing_radiography(seller_id, item_id) WHERE is_current = true;

-- RLS Policies
ALTER TABLE listing_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_radiography ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_monitor_config ENABLE ROW LEVEL SECURITY;

-- Snapshots: leitura via seller_id associado ao usuário
CREATE POLICY "Users can view their listing snapshots" ON listing_snapshots
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM ml_accounts WHERE ml_user_id = seller_id AND user_id = auth.uid())
  );

CREATE POLICY "Service role can manage snapshots" ON listing_snapshots
  FOR ALL USING (true) WITH CHECK (true);

-- Events: mesma lógica
CREATE POLICY "Users can view their listing events" ON listing_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM ml_accounts WHERE ml_user_id = seller_id AND user_id = auth.uid())
  );

CREATE POLICY "Service role can manage events" ON listing_events
  FOR ALL USING (true) WITH CHECK (true);

-- Radiography: mesma lógica
CREATE POLICY "Users can view their radiography" ON listing_radiography
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM ml_accounts WHERE ml_user_id = seller_id AND user_id = auth.uid())
  );

CREATE POLICY "Service role can manage radiography" ON listing_radiography
  FOR ALL USING (true) WITH CHECK (true);

-- Config: usuário gerencia a própria
CREATE POLICY "Users can manage their monitor config" ON listing_monitor_config
  FOR ALL USING (user_id = auth.uid());

-- Trigger para updated_at
CREATE TRIGGER update_listing_radiography_updated_at
  BEFORE UPDATE ON listing_radiography
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_listing_monitor_config_updated_at
  BEFORE UPDATE ON listing_monitor_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();