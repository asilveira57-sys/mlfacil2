
-- 1. Table: user_plan_assignments (plan history/audit per seller)
CREATE TABLE IF NOT EXISTS public.user_plan_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  plan_tier_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'expired')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  is_trial boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_plan_assignments_user ON public.user_plan_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_plan_assignments_tenant ON public.user_plan_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_plan_assignments_plan ON public.user_plan_assignments(plan_tier_id);
CREATE INDEX IF NOT EXISTS idx_user_plan_assignments_status ON public.user_plan_assignments(status);

-- RLS
ALTER TABLE public.user_plan_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own plan assignments"
  ON public.user_plan_assignments FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "System can insert plan assignments"
  ON public.user_plan_assignments FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "System can update own plan assignments"
  ON public.user_plan_assignments FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());
