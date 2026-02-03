-- Tabela de controle para jobs de sincronização automática
CREATE TABLE public.sync_scheduler (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL UNIQUE,
  last_run_at TIMESTAMP WITH TIME ZONE,
  next_run_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'idle',
  lock_expires_at TIMESTAMP WITH TIME ZONE,
  locked_by TEXT,
  stats JSONB DEFAULT '{}'::JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Trigger para updated_at
CREATE TRIGGER update_sync_scheduler_updated_at
  BEFORE UPDATE ON public.sync_scheduler
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Inserir registros iniciais para os jobs
INSERT INTO public.sync_scheduler (job_name, status) VALUES 
  ('orders-nightly-sync', 'idle'),
  ('orders-hourly-sync', 'idle');

-- Índice para busca rápida por job_name
CREATE INDEX idx_sync_scheduler_job_name ON public.sync_scheduler(job_name);

-- RLS: permitir leitura pública (para frontend verificar status)
ALTER TABLE public.sync_scheduler ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to sync_scheduler" 
  ON public.sync_scheduler 
  FOR SELECT 
  USING (true);

-- Apenas funções de backend podem modificar (via service role)
CREATE POLICY "Service role can manage sync_scheduler" 
  ON public.sync_scheduler 
  FOR ALL 
  USING (auth.role() = 'service_role');