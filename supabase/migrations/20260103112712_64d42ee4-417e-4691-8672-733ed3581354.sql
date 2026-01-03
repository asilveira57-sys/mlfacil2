-- =========================================================
-- TABELA 1: meli_financial_movements_cache
-- Armazena cada movimento financeiro como linha individual
-- =========================================================
CREATE TABLE public.meli_financial_movements_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  seller_id text NOT NULL,
  movement_id text NOT NULL,
  order_id text,
  shipment_id text,
  payment_id text,
  concept text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  currency_id text DEFAULT 'BRL',
  movement_date timestamptz NOT NULL,
  status text,
  raw_json jsonb,
  last_sync_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (seller_id, movement_id)
);

-- Índices para performance
CREATE INDEX idx_financial_movements_seller ON public.meli_financial_movements_cache(seller_id);
CREATE INDEX idx_financial_movements_order ON public.meli_financial_movements_cache(order_id);
CREATE INDEX idx_financial_movements_date ON public.meli_financial_movements_cache(movement_date);
CREATE INDEX idx_financial_movements_concept ON public.meli_financial_movements_cache(concept);

-- RLS
ALTER TABLE public.meli_financial_movements_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meli_financial_movements_cache_all" 
ON public.meli_financial_movements_cache 
FOR ALL 
USING (auth.uid() = user_id);

-- =========================================================
-- TABELA 2: meli_financial_sync_state
-- Controla paginação e estado da sincronização
-- =========================================================
CREATE TABLE public.meli_financial_sync_state (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  seller_id text NOT NULL UNIQUE,
  last_sync_started_at timestamptz,
  last_sync_finished_at timestamptz,
  last_synced_from date,
  last_synced_to date,
  cursor_or_offset text,
  status text NOT NULL DEFAULT 'idle',
  last_error text,
  movements_synced integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.meli_financial_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meli_financial_sync_state_all" 
ON public.meli_financial_sync_state 
FOR ALL 
USING (auth.uid() = user_id);

-- =========================================================
-- TABELA 3: financial_concept_map
-- Mapeia conceitos do ML para buckets do relatório
-- =========================================================
CREATE TABLE public.financial_concept_map (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id text NOT NULL,
  user_id uuid NOT NULL,
  concept text NOT NULL,
  bucket text NOT NULL DEFAULT 'ignorar',
  signal text NOT NULL DEFAULT 'manter',
  notes_pt text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (seller_id, concept)
);

-- RLS
ALTER TABLE public.financial_concept_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "financial_concept_map_all" 
ON public.financial_concept_map 
FOR ALL 
USING (auth.uid() = user_id);

-- =========================================================
-- ATUALIZAÇÃO: order_cost_breakdown_cache
-- Adicionar colunas do relatório financeiro
-- =========================================================
ALTER TABLE public.order_cost_breakdown_cache 
ADD COLUMN IF NOT EXISTS receita_produtos numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS receita_acrescimo numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS taxa_parcelamento_equivalente numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS tarifa_venda_e_impostos numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS receita_envio numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS tarifas_envio numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS custo_envio_declarado numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS custo_diferenca_peso_medidas numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS cancelamentos_reembolsos numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_liquido numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS missing_financial_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS has_real_financial boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS raw_summary_json jsonb;

-- Índice extra
CREATE INDEX IF NOT EXISTS idx_order_cost_calculated_at ON public.order_cost_breakdown_cache(calculated_at);