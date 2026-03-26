
-- Tabela de snapshots imutáveis da jornada do seller
CREATE TABLE public.seller_journey_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  seller_id TEXT,
  snapshot_type TEXT NOT NULL, -- initial, ads, promo, periodic
  period_days INTEGER NOT NULL DEFAULT 0, -- 0=initial, 15, 30, 90
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Bloco Vendas
  orders_count INTEGER DEFAULT 0,
  revenue NUMERIC(14,2) DEFAULT 0,
  avg_ticket NUMERIC(10,2) DEFAULT 0,
  
  -- Bloco Produtos
  total_products INTEGER DEFAULT 0,
  products_with_sales INTEGER DEFAULT 0,
  products_without_sales INTEGER DEFAULT 0,
  
  -- Bloco Sistema
  modules_activated INTEGER DEFAULT 0,
  actions_count INTEGER DEFAULT 0,
  
  -- Bloco ADS
  ads_connected BOOLEAN DEFAULT false,
  campaigns_count INTEGER DEFAULT 0,
  acos NUMERIC(8,4) DEFAULT 0,
  tacos NUMERIC(8,4) DEFAULT 0,
  roas NUMERIC(8,4) DEFAULT 0,
  ad_spend NUMERIC(14,2) DEFAULT 0,
  ad_revenue NUMERIC(14,2) DEFAULT 0,
  
  -- Bloco Promoções
  promotions_connected BOOLEAN DEFAULT false,
  promotions_count INTEGER DEFAULT 0,
  auto_promotions_count INTEGER DEFAULT 0,
  
  -- Meta
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_seller_journey_user ON public.seller_journey_snapshots(user_id, snapshot_type);
CREATE INDEX idx_seller_journey_company ON public.seller_journey_snapshots(company_id, snapshot_type);
CREATE INDEX idx_seller_journey_seller ON public.seller_journey_snapshots(seller_id, snapshot_type);
CREATE INDEX idx_seller_journey_date ON public.seller_journey_snapshots(snapshot_date);

-- RLS
ALTER TABLE public.seller_journey_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own snapshots"
  ON public.seller_journey_snapshots FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service can insert snapshots"
  ON public.seller_journey_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Admin full access
CREATE POLICY "Admin full access to journey snapshots"
  ON public.seller_journey_snapshots FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Tabela de log de jornada
CREATE TABLE public.seller_journey_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  seller_id TEXT,
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_journey_logs_user ON public.seller_journey_logs(user_id, event_type);
CREATE INDEX idx_journey_logs_date ON public.seller_journey_logs(created_at);

ALTER TABLE public.seller_journey_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own journey logs"
  ON public.seller_journey_logs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can read own journey logs"
  ON public.seller_journey_logs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admin full access to journey logs"
  ON public.seller_journey_logs FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
