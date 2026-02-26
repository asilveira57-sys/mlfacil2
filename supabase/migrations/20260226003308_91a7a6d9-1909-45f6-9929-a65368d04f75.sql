
-- 1. Create price_adjustment_logs table
CREATE TABLE public.price_adjustment_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  seller_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  item_id TEXT NOT NULL,
  titulo TEXT,
  preco_antigo NUMERIC,
  preco_novo NUMERIC,
  percentual NUMERIC,
  tipo_ajuste TEXT NOT NULL CHECK (tipo_ajuste IN ('aumentar', 'diminuir')),
  modo TEXT NOT NULL CHECK (modo IN ('teste', 'definitivo')),
  arredondamento TEXT CHECK (arredondamento IN ('90', '99', 'nenhum')),
  possui_variacao BOOLEAN DEFAULT false,
  possui_pxq BOOLEAN DEFAULT false,
  request_payload JSONB,
  response_status INTEGER,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.price_adjustment_logs ENABLE ROW LEVEL SECURITY;

-- Users can view their own logs
CREATE POLICY "Users can view their own price adjustment logs"
  ON public.price_adjustment_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own logs
CREATE POLICY "Users can insert their own price adjustment logs"
  ON public.price_adjustment_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Index for performance
CREATE INDEX idx_price_adj_logs_user ON public.price_adjustment_logs(user_id);
CREATE INDEX idx_price_adj_logs_seller ON public.price_adjustment_logs(seller_id);
CREATE INDEX idx_price_adj_logs_created ON public.price_adjustment_logs(created_at DESC);

-- 2. Register module in system_modules (under Operacional)
INSERT INTO public.system_modules (id, key, name, layer, parent_module_id, sort_order, icon_key, route, is_active) VALUES
  ('c0000000-0000-0000-0000-000000000030', 'operacional.price_adjustment', 'Ajuste de Preço', 'operacional', 'c0000000-0000-0000-0000-000000000001', 3, 'DollarSign', '/ajuste-preco', true);
