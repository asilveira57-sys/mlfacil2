
-- 1. Tabela system_logs
CREATE TABLE public.system_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  level TEXT NOT NULL DEFAULT 'info',
  system_area TEXT NOT NULL,
  action TEXT NOT NULL,
  user_id UUID,
  company_id UUID,
  success BOOLEAN NOT NULL DEFAULT true,
  message TEXT,
  meta_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- 2. Índices
CREATE INDEX idx_system_logs_created_at ON public.system_logs (created_at DESC);
CREATE INDEX idx_system_logs_area_created ON public.system_logs (system_area, created_at DESC);
CREATE INDEX idx_system_logs_company_created ON public.system_logs (company_id, created_at DESC);
CREATE INDEX idx_system_logs_level_created ON public.system_logs (level, created_at DESC);

-- 3. RLS
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- Admins podem ler todos os logs
CREATE POLICY "Admins can read all logs"
  ON public.system_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Usuários podem ver seus próprios logs
CREATE POLICY "Users can read own logs"
  ON public.system_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Insert via service_role (edge functions) - sem restrição por RLS
CREATE POLICY "Service role can insert logs"
  ON public.system_logs FOR INSERT
  WITH CHECK (true);

-- 4. Função reutilizável register_system_log
CREATE OR REPLACE FUNCTION public.register_system_log(
  p_level TEXT,
  p_system_area TEXT,
  p_action TEXT,
  p_user_id UUID DEFAULT NULL,
  p_company_id UUID DEFAULT NULL,
  p_success BOOLEAN DEFAULT true,
  p_message TEXT DEFAULT NULL,
  p_meta_json JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.system_logs (level, system_area, action, user_id, company_id, success, message, meta_json)
  VALUES (p_level, p_system_area, p_action, p_user_id, p_company_id, p_success, p_message, p_meta_json)
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
EXCEPTION WHEN OTHERS THEN
  -- Nunca interromper o fluxo principal
  RAISE WARNING 'register_system_log failed: %', SQLERRM;
  RETURN NULL;
END;
$$;
