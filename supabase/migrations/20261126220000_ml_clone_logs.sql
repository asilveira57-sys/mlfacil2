CREATE TABLE IF NOT EXISTS public.ml_clone_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  origin_seller_id TEXT NOT NULL,
  dest_seller_id TEXT NOT NULL,
  source_item_id TEXT NOT NULL,
  new_item_id TEXT,
  status TEXT NOT NULL,
  modo TEXT,
  request_payload JSONB,
  response_status INTEGER,
  response_body JSONB,
  description_ok BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ml_clone_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own clone logs" ON public.ml_clone_logs;
CREATE POLICY "own clone logs" ON public.ml_clone_logs FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_ml_clone_logs_user ON public.ml_clone_logs(user_id, created_at DESC);

-- Recadastro (mesma conta): par antigo→novo e MLBU de cada um
ALTER TABLE public.ml_clone_logs
  ADD COLUMN IF NOT EXISTS recadastro boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS old_closed boolean,
  ADD COLUMN IF NOT EXISTS old_user_product_id text,
  ADD COLUMN IF NOT EXISTS new_user_product_id text;
