
-- Sandbox company snapshot cache table
CREATE TABLE public.sandbox_company_snapshot (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  
  -- Bloco Comercial (semana)
  total_vendas_semana NUMERIC DEFAULT 0,
  pedidos_semana INTEGER DEFAULT 0,
  ticket_medio NUMERIC DEFAULT 0,
  produto_mais_vendido TEXT,
  
  -- Bloco Operação
  etiquetas_pendentes INTEGER DEFAULT 0,
  nf_pendentes INTEGER DEFAULT 0,
  perguntas_pendentes INTEGER DEFAULT 0,
  pedidos_envio INTEGER DEFAULT 0,
  
  -- Bloco Reclamações / Pós-venda
  reclamacoes_abertas INTEGER DEFAULT 0,
  reclamacoes_aguardando INTEGER DEFAULT 0,
  pos_venda_pendente INTEGER DEFAULT 0,
  mediacoes_abertas INTEGER DEFAULT 0,
  
  -- Bloco ADS
  gasto_ads_semana NUMERIC DEFAULT 0,
  faturamento_ads_semana NUMERIC DEFAULT 0,
  acos_medio NUMERIC DEFAULT 0,
  roas_medio NUMERIC DEFAULT 0,
  
  -- Hora de corte
  cutoff_flex_time TEXT,
  cutoff_coleta_time TEXT,
  
  -- Estoque
  estoque_critico INTEGER DEFAULT 0,
  
  -- Meta
  snapshot_status TEXT DEFAULT 'ok',
  snapshot_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT uq_sandbox_snapshot_company UNIQUE (company_id)
);

-- Indexes
CREATE INDEX idx_sandbox_snapshot_user ON public.sandbox_company_snapshot(user_id);
CREATE INDEX idx_sandbox_snapshot_seller ON public.sandbox_company_snapshot(seller_id);
CREATE INDEX idx_sandbox_snapshot_updated ON public.sandbox_company_snapshot(updated_at);

-- Enable RLS
ALTER TABLE public.sandbox_company_snapshot ENABLE ROW LEVEL SECURITY;

-- Users can only see their own snapshots
CREATE POLICY "Users can view own sandbox snapshots"
  ON public.sandbox_company_snapshot FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can upsert (edge function)
CREATE POLICY "Service can manage sandbox snapshots"
  ON public.sandbox_company_snapshot FOR ALL
  USING (true)
  WITH CHECK (true);

-- Updated_at trigger
CREATE TRIGGER update_sandbox_snapshot_updated_at
  BEFORE UPDATE ON public.sandbox_company_snapshot
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
