-- Log de ajustes de sale_terms (ex.: MANUFACTURING_TIME) feitos pela ml-price-adjustment.
-- Guarda os sale_terms ANTES para permitir desfazer.
CREATE TABLE IF NOT EXISTS public.sale_term_adjustment_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  item_id TEXT NOT NULL,
  titulo TEXT,
  term_id TEXT NOT NULL,
  valor_antes TEXT,
  valor_depois TEXT,
  sale_terms_antes JSONB,
  request_payload JSONB,
  response_status INTEGER,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sale_term_adjustment_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own sale term logs" ON public.sale_term_adjustment_logs;
CREATE POLICY "Users can view their own sale term logs"
  ON public.sale_term_adjustment_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sale_term_logs_item ON public.sale_term_adjustment_logs(item_id);
CREATE INDEX IF NOT EXISTS idx_sale_term_logs_created ON public.sale_term_adjustment_logs(created_at DESC);
