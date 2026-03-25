
-- Logs for manual intro openings from sidebar
CREATE TABLE public.module_intro_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  module_slug TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'open_intro_manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying by user/module
CREATE INDEX idx_module_intro_logs_user ON public.module_intro_logs(user_id, module_slug);
CREATE INDEX idx_module_intro_logs_created ON public.module_intro_logs(created_at);

-- RLS
ALTER TABLE public.module_intro_logs ENABLE ROW LEVEL SECURITY;

-- Users can insert their own logs
CREATE POLICY "Users can insert own intro logs"
  ON public.module_intro_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can read their own logs  
CREATE POLICY "Users can read own intro logs"
  ON public.module_intro_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
