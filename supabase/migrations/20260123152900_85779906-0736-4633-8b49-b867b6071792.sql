-- Tabela de cache de elegibilidade por categoria do seller
-- TTL de 24h para bloqueios, recalculado sob demanda

CREATE TABLE public.seller_category_eligibility (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  period_key TEXT NOT NULL DEFAULT 'last_30d',
  
  -- Estado de elegibilidade
  eligibility_state TEXT NOT NULL DEFAULT 'unknown' CHECK (eligibility_state IN ('eligible', 'low_base', 'inactive', 'unknown')),
  
  -- Métricas usadas na decisão
  orders_count INTEGER NOT NULL DEFAULT 0,
  revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  units_sold INTEGER NOT NULL DEFAULT 0,
  
  -- Thresholds aplicados (para auditoria)
  threshold_orders INTEGER NOT NULL DEFAULT 10,
  threshold_revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  
  -- Controle de cache e bloqueio
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  blocked_until TIMESTAMPTZ NULL, -- Se preenchido, não tenta endpoints seller-based
  block_reason TEXT NULL,
  
  -- Auditoria
  last_api_attempt_at TIMESTAMPTZ NULL,
  api_attempts_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT seller_category_eligibility_unique UNIQUE (seller_id, category_id, period_key)
);

-- Enable RLS
ALTER TABLE public.seller_category_eligibility ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own eligibility data"
ON public.seller_category_eligibility
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own eligibility data"
ON public.seller_category_eligibility
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own eligibility data"
ON public.seller_category_eligibility
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own eligibility data"
ON public.seller_category_eligibility
FOR DELETE
USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX idx_seller_category_eligibility_lookup 
ON public.seller_category_eligibility (seller_id, category_id, period_key);

CREATE INDEX idx_seller_category_eligibility_expires 
ON public.seller_category_eligibility (expires_at);

-- Trigger for updated_at
CREATE TRIGGER update_seller_category_eligibility_updated_at
BEFORE UPDATE ON public.seller_category_eligibility
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Função para calcular elegibilidade baseada em pedidos existentes
CREATE OR REPLACE FUNCTION public.calculate_category_eligibility(
  p_user_id UUID,
  p_seller_id TEXT,
  p_category_id TEXT,
  p_period_days INTEGER DEFAULT 30,
  p_threshold_orders INTEGER DEFAULT 10
)
RETURNS TABLE (
  eligibility_state TEXT,
  orders_count INTEGER,
  revenue NUMERIC,
  units_sold INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_date_from DATE;
  v_orders_count INTEGER;
  v_revenue NUMERIC;
  v_units_sold INTEGER;
  v_state TEXT;
BEGIN
  v_date_from := CURRENT_DATE - p_period_days;
  
  -- Contar pedidos e métricas da categoria
  SELECT 
    COUNT(DISTINCT i.order_id),
    COALESCE(SUM(i.quantity * i.unit_price), 0),
    COALESCE(SUM(i.quantity), 0)
  INTO v_orders_count, v_revenue, v_units_sold
  FROM meli_order_items_cache i
  INNER JOIN meli_listings_cache l 
    ON l.seller_id = i.seller_id 
    AND l.item_id = i.item_id
  INNER JOIN meli_orders_cache o
    ON o.seller_id = i.seller_id 
    AND o.order_id = i.order_id
  WHERE i.seller_id = p_seller_id
    AND i.user_id = p_user_id
    AND l.category_id = p_category_id
    AND o.order_status = 'paid'
    AND (o.created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date >= v_date_from;
  
  -- Determinar estado
  IF v_orders_count >= p_threshold_orders THEN
    v_state := 'eligible';
  ELSIF v_orders_count > 0 THEN
    v_state := 'low_base';
  ELSE
    v_state := 'inactive';
  END IF;
  
  RETURN QUERY SELECT v_state, v_orders_count, v_revenue, v_units_sold;
END;
$$;