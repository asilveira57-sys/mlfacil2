
-- Add missing columns to existing sync_jobs table
ALTER TABLE public.sync_jobs ADD COLUMN IF NOT EXISTS scope TEXT DEFAULT 'full';
ALTER TABLE public.sync_jobs ADD COLUMN IF NOT EXISTS locked_after_success BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.sync_jobs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.sync_jobs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE public.sync_jobs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Indexes for the new lock logic
CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_jobs_lock 
  ON public.sync_jobs (company_id, job_type, scope) 
  WHERE locked_after_success = true AND status = 'done';

CREATE INDEX IF NOT EXISTS idx_sync_jobs_running 
  ON public.sync_jobs (company_id, job_type) 
  WHERE status IN ('processing', 'running');

-- Helper function: check if a sync can run
CREATE OR REPLACE FUNCTION public.can_start_sync(
  p_company_id UUID,
  p_job_type TEXT,
  p_scope TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_running RECORD;
  v_locked RECORD;
BEGIN
  SELECT id INTO v_running
  FROM public.sync_jobs
  WHERE company_id = p_company_id AND job_type = p_job_type AND status IN ('processing', 'running')
  LIMIT 1;
  
  IF v_running IS NOT NULL THEN
    RETURN jsonb_build_object('can_start', false, 'reason', 'already_running', 'job_id', v_running.id);
  END IF;
  
  SELECT id INTO v_locked
  FROM public.sync_jobs
  WHERE company_id = p_company_id AND job_type = p_job_type AND scope = p_scope
    AND locked_after_success = true AND status = 'done'
  LIMIT 1;
  
  IF v_locked IS NOT NULL THEN
    RETURN jsonb_build_object('can_start', false, 'reason', 'locked_after_success', 'job_id', v_locked.id);
  END IF;
  
  RETURN jsonb_build_object('can_start', true);
END;
$$;

-- Helper: check if company billing is complete
CREATE OR REPLACE FUNCTION public.is_billing_complete(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_complete BOOLEAN;
BEGIN
  SELECT cb.is_complete INTO v_complete
  FROM public.company_billing cb
  INNER JOIN public.companies c ON c.id = cb.company_id
  WHERE c.user_id = p_user_id AND c.is_active = true
  LIMIT 1;
  
  RETURN COALESCE(v_complete, false);
END;
$$;

-- Update get_user_feature_flags to include billing_complete and requires_billing
CREATE OR REPLACE FUNCTION public.get_user_feature_flags(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.user_access_state;
  v_flags JSONB;
  v_ml_account RECORD;
  v_company RECORD;
  v_subscription RECORD;
  v_api_access JSONB;
  v_billing_complete BOOLEAN;
BEGIN
  SELECT * INTO v_state FROM public.user_access_state WHERE user_id = p_user_id;
  
  IF v_state IS NULL THEN
    RETURN jsonb_build_object('error', 'no_state');
  END IF;
  
  SELECT id, is_active, ml_user_id INTO v_ml_account
  FROM public.ml_accounts WHERE user_id = p_user_id AND is_active = true LIMIT 1;
  
  SELECT * INTO v_company
  FROM public.companies WHERE user_id = p_user_id AND is_active = true ORDER BY created_at ASC LIMIT 1;
  
  IF v_company IS NOT NULL THEN
    SELECT s.*, pv.plan_type, pv.slug as plan_slug
    INTO v_subscription
    FROM public.subscriptions s
    LEFT JOIN public.plans_v2 pv ON pv.id = s.plan_id
    WHERE s.company_id = v_company.id AND s.status = 'active'
    LIMIT 1;
  END IF;
  
  v_api_access := public.check_ml_api_access(p_user_id);
  v_billing_complete := public.is_billing_complete(p_user_id);
  
  v_flags := jsonb_build_object(
    'requires_onboarding', v_state.onboarding_status = 'pending',
    'onboarding_completed', v_state.onboarding_status = 'completed',
    'trial_active', v_state.trial_status = 'active' AND v_state.trial_end_at > now(),
    'trial_expired', v_state.trial_status = 'expired' OR (v_state.trial_status = 'active' AND v_state.trial_end_at <= now()),
    'trial_days_remaining', CASE 
      WHEN v_state.trial_end_at IS NOT NULL AND v_state.trial_end_at > now() 
      THEN GREATEST(0, EXTRACT(DAY FROM (v_state.trial_end_at - now()))::integer)
      ELSE 0
    END,
    'trial_end_at', v_state.trial_end_at,
    'requires_payment', v_state.payment_status IN ('blocked', 'free') AND v_state.trial_status = 'expired',
    'has_active_subscription', v_subscription IS NOT NULL,
    'billing_complete', v_billing_complete,
    'requires_billing', v_subscription IS NOT NULL AND NOT v_billing_complete,
    'ml_connected', v_state.ml_account_connected,
    'ml_is_owner', v_state.ml_account_role = 'owner',
    'ml_is_collaborator', v_state.ml_account_role = 'collaborator',
    'ml_requires_owner_warning', v_state.ml_account_role = 'collaborator',
    'ml_api_access_allowed', COALESCE((v_api_access->>'allowed')::boolean, false),
    'ml_api_access_reason', v_api_access->>'reason',
    'ml_api_access_message', v_api_access->>'message',
    'can_print_labels', v_state.ml_account_connected AND (
      v_state.trial_status = 'active' OR v_state.payment_status = 'active'
    ),
    'can_import_sales', v_state.ml_account_connected AND COALESCE((v_api_access->>'allowed')::boolean, false),
    'can_access_reports', v_state.onboarding_status = 'completed',
    'can_manage_integrations', true,
    'trial_warnings', CASE
      WHEN v_state.trial_status = 'active' AND v_state.trial_end_at IS NOT NULL 
           AND v_state.trial_end_at - now() < interval '3 days'
      THEN jsonb_build_array('trial_ending_soon')
      ELSE '[]'::jsonb
    END,
    'computed_at', now(),
    'state_version', 2
  );
  
  RETURN v_flags;
END;
$$;
