
-- =============================================
-- mktpfacil Clone Module: Jobs, Units, Logs
-- =============================================

-- 1) Clone Jobs (um job por clique em "Clonar")
CREATE TABLE public.mktpfacil_clone_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  destination_account_id UUID NOT NULL REFERENCES public.ml_accounts(id),
  source_url TEXT,
  source_item_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','partial','failed','cancelled')),
  settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_snapshot_json JSONB,
  summary_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mktpfacil_clone_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own clone jobs"
  ON public.mktpfacil_clone_jobs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_mktpfacil_clone_jobs_updated_at
  BEFORE UPDATE ON public.mktpfacil_clone_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Index for listing jobs
CREATE INDEX idx_clone_jobs_user_status ON public.mktpfacil_clone_jobs (user_id, status);

-- 2) Clone Job Units (uma por variação/unidade clonável)
CREATE TABLE public.mktpfacil_clone_job_units (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.mktpfacil_clone_jobs(id) ON DELETE CASCADE,
  unit_index INTEGER NOT NULL DEFAULT 0,
  source_variation_id TEXT,
  unit_snapshot_json JSONB,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','created','failed')),
  destination_item_id TEXT,
  destination_permalink TEXT,
  error_code TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mktpfacil_clone_job_units ENABLE ROW LEVEL SECURITY;

-- RLS via join to parent job
CREATE POLICY "Users manage own clone job units"
  ON public.mktpfacil_clone_job_units FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.mktpfacil_clone_jobs j WHERE j.id = job_id AND j.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.mktpfacil_clone_jobs j WHERE j.id = job_id AND j.user_id = auth.uid()
  ));

CREATE TRIGGER update_mktpfacil_clone_job_units_updated_at
  BEFORE UPDATE ON public.mktpfacil_clone_job_units
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_clone_units_job ON public.mktpfacil_clone_job_units (job_id);

-- 3) System Logs for clone module
CREATE TABLE public.mktpfacil_system_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  module TEXT NOT NULL DEFAULT 'anuncios_clonar',
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info','warn','error')),
  event_name TEXT NOT NULL,
  message TEXT,
  context_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mktpfacil_system_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own logs"
  ON public.mktpfacil_system_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System inserts logs"
  ON public.mktpfacil_system_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_clone_logs_user_module ON public.mktpfacil_system_logs (user_id, module);
CREATE INDEX idx_clone_logs_entity ON public.mktpfacil_system_logs (entity_type, entity_id);

-- 4) View for clone history
CREATE OR REPLACE VIEW public.mktpfacil_clone_history AS
SELECT
  j.id as job_id,
  j.user_id,
  j.source_item_id,
  j.source_url,
  j.destination_account_id,
  a.nickname as destination_nickname,
  a.ml_user_id as destination_seller_id,
  j.status,
  j.created_at,
  j.started_at,
  j.finished_at,
  j.source_snapshot_json->>'title' as source_title,
  j.source_snapshot_json->>'thumbnail' as source_thumbnail,
  j.settings_json,
  j.summary_json,
  (SELECT COUNT(*) FROM public.mktpfacil_clone_job_units u WHERE u.job_id = j.id) as total_units,
  (SELECT COUNT(*) FROM public.mktpfacil_clone_job_units u WHERE u.job_id = j.id AND u.status = 'created') as created_units,
  (SELECT COUNT(*) FROM public.mktpfacil_clone_job_units u WHERE u.job_id = j.id AND u.status = 'failed') as failed_units
FROM public.mktpfacil_clone_jobs j
LEFT JOIN public.ml_accounts a ON a.id = j.destination_account_id;
