
-- Add fields to plan_tiers
ALTER TABLE public.plan_tiers 
  ADD COLUMN IF NOT EXISTS plan_group text DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS requires_marketplace_connection boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

-- Add category + requires_connection to system_modules if missing
ALTER TABLE public.system_modules
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS requires_connection boolean DEFAULT false;

-- Backfill category from layer
UPDATE public.system_modules SET category = layer::text WHERE category IS NULL;

-- plan_modules: relationship between plan_tiers and system_modules
CREATE TABLE IF NOT EXISTS public.plan_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.plan_tiers(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.system_modules(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE(plan_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_plan_modules_plan ON public.plan_modules(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_modules_module ON public.plan_modules(module_id);

ALTER TABLE public.plan_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_plan_modules" ON public.plan_modules
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "authenticated_read_plan_modules" ON public.plan_modules
  FOR SELECT TO authenticated USING (true);

-- plan_access_logs: audit trail
CREATE TABLE IF NOT EXISTS public.plan_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  tenant_id uuid,
  action_type text NOT NULL,
  entity_type text,
  entity_id uuid,
  module_code text,
  access_granted boolean,
  reason text,
  payload_before jsonb,
  payload_after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plan_access_logs_user ON public.plan_access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_plan_access_logs_tenant ON public.plan_access_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_plan_access_logs_action ON public.plan_access_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_plan_access_logs_created ON public.plan_access_logs(created_at DESC);

ALTER TABLE public.plan_access_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_access_logs" ON public.plan_access_logs
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "service_insert_access_logs" ON public.plan_access_logs
  FOR INSERT WITH CHECK (true);
