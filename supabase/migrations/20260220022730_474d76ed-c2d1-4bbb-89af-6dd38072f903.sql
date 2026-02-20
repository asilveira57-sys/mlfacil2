
-- Global Metrics Aggregated (singleton)
CREATE TABLE public.global_metrics_aggregated (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  total_sellers integer NOT NULL DEFAULT 0,
  total_pedidos bigint NOT NULL DEFAULT 0,
  total_valor_vendido numeric(18,2) NOT NULL DEFAULT 0,
  total_etiquetas_impressas bigint NOT NULL DEFAULT 0,
  total_ads_spend numeric(18,2) NOT NULL DEFAULT 0,
  total_ads_faturamento numeric(18,2) NOT NULL DEFAULT 0,
  roas_medio_global numeric(10,4) NOT NULL DEFAULT 0,
  acos_medio_global numeric(10,4) NOT NULL DEFAULT 0,
  total_anuncios_ativos bigint NOT NULL DEFAULT 0,
  total_produtos_cadastrados bigint NOT NULL DEFAULT 0,
  total_precificacoes_realizadas bigint NOT NULL DEFAULT 0,
  total_importacoes_vendas bigint NOT NULL DEFAULT 0,
  total_sugestoes_compra_geradas bigint NOT NULL DEFAULT 0,
  total_logs_sistema bigint NOT NULL DEFAULT 0,
  is_public_ready boolean NOT NULL DEFAULT false,
  last_full_refresh_at timestamptz,
  last_incremental_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.global_metrics_aggregated ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read global metrics"
  ON public.global_metrics_aggregated FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin update global metrics"
  ON public.global_metrics_aggregated FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role insert global metrics"
  ON public.global_metrics_aggregated FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role update global metrics"
  ON public.global_metrics_aggregated FOR UPDATE
  TO service_role
  USING (true);

-- Global Metrics Monthly Snapshot
CREATE TABLE public.global_metrics_monthly_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ano integer NOT NULL,
  mes integer NOT NULL,
  total_pedidos bigint NOT NULL DEFAULT 0,
  total_valor_vendido numeric(18,2) NOT NULL DEFAULT 0,
  total_ads_spend numeric(18,2) NOT NULL DEFAULT 0,
  total_ads_faturamento numeric(18,2) NOT NULL DEFAULT 0,
  total_etiquetas bigint NOT NULL DEFAULT 0,
  total_anuncios bigint NOT NULL DEFAULT 0,
  total_sellers integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(ano, mes)
);

ALTER TABLE public.global_metrics_monthly_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read monthly snapshots"
  ON public.global_metrics_monthly_snapshot FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role insert monthly snapshots"
  ON public.global_metrics_monthly_snapshot FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role update monthly snapshots"
  ON public.global_metrics_monthly_snapshot FOR UPDATE
  TO service_role
  USING (true);

-- Public read policy for when is_public_ready is true
CREATE POLICY "Public read when ready"
  ON public.global_metrics_aggregated FOR SELECT
  TO anon
  USING (is_public_ready = true);

-- Trigger for updated_at
CREATE TRIGGER update_global_metrics_updated_at
  BEFORE UPDATE ON public.global_metrics_aggregated
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for monthly snapshots
CREATE INDEX idx_global_metrics_monthly_ano_mes ON public.global_metrics_monthly_snapshot(ano DESC, mes DESC);
