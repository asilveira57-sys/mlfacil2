
CREATE OR REPLACE FUNCTION public.get_user_feature_flags(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.user_access_state%ROWTYPE;
  v_subscription RECORD;
  v_company RECORD;
  v_api_access jsonb;
  v_effective_trial_end_at timestamptz;
  v_has_active_sub boolean;
  v_trial_active boolean;
  v_trial_expired boolean;
  v_trial_days_remaining integer;
  v_warnings jsonb := '[]'::jsonb;
BEGIN
  -- Get user access state
  SELECT * INTO v_state
  FROM public.user_access_state
  WHERE user_id = p_user_id;

  IF v_state IS NULL THEN
    RETURN jsonb_build_object(
      'requires_onboarding', true,
      'onboarding_completed', false,
      'trial_active', false,
      'trial_expired', false,
      'trial_days_remaining', 0,
      'trial_end_at', null,
      'requires_payment', false,
      'has_active_subscription', false,
      'billing_complete', false,
      'requires_billing', false,
      'ml_connected', false,
      'ml_is_owner', false,
      'ml_is_collaborator', false,
      'ml_requires_owner_warning', false,
      'ml_api_access_allowed', true,
      'ml_api_access_reason', null,
      'ml_api_access_message', null,
      'can_print_labels', false,
      'can_import_sales', false,
      'can_access_reports', false,
      'can_manage_integrations', false,
      'trial_warnings', '[]'::jsonb,
      'computed_at', now(),
      'state_version', 1
    );
  END IF;

  -- Get company info
  SELECT c.* INTO v_company
  FROM public.companies c
  JOIN public.company_members cm ON cm.company_id = c.id
  WHERE cm.user_id = p_user_id
  LIMIT 1;

  -- Calculate effective trial end date (GREATEST of manual and legacy)
  v_effective_trial_end_at := GREATEST(
    COALESCE(v_state.trial_end_at, '-infinity'::timestamptz),
    COALESCE(v_company.trial_ends_at, '-infinity'::timestamptz)
  );

  -- If effective end is -infinity, set to null
  IF v_effective_trial_end_at = '-infinity'::timestamptz THEN
    v_effective_trial_end_at := NULL;
  END IF;

  -- Get active subscription
  SELECT s.* INTO v_subscription
  FROM public.subscriptions s
  WHERE s.user_id = p_user_id
    AND s.status = 'active'
  ORDER BY s.created_at DESC
  LIMIT 1;

  -- Check ML API access
  BEGIN
    v_api_access := public.check_ml_api_access(p_user_id);
  EXCEPTION WHEN OTHERS THEN
    v_api_access := jsonb_build_object('allowed', true, 'reason', 'check_failed');
  END;

  -- Calculate trial status using effective end date
  v_trial_active := (
    v_effective_trial_end_at IS NOT NULL 
    AND v_effective_trial_end_at > now()
    AND v_state.payment_status IN ('trial', 'free')
  );

  v_trial_expired := (
    v_effective_trial_end_at IS NOT NULL 
    AND v_effective_trial_end_at <= now()
    AND v_subscription IS NULL
    AND v_state.payment_status NOT IN ('active')
    AND NOT COALESCE((v_api_access->>'allowed')::boolean, false)
  );

  v_trial_days_remaining := CASE 
    WHEN v_effective_trial_end_at IS NOT NULL AND v_effective_trial_end_at > now()
    THEN GREATEST(0, EXTRACT(DAY FROM v_effective_trial_end_at - now())::integer)
    ELSE 0
  END;

  -- has_active_subscription: true if paid subscription, active status, active trial, or API access allowed
  v_has_active_sub := (
    v_subscription IS NOT NULL
    OR v_state.payment_status = 'active'
    OR (v_state.payment_status = 'trial' AND v_effective_trial_end_at IS NOT NULL AND v_effective_trial_end_at > now())
    OR COALESCE((v_api_access->>'allowed')::boolean, false)
  );

  -- Warnings
  IF v_trial_active AND v_trial_days_remaining <= 7 THEN
    v_warnings := v_warnings || jsonb_build_array(
      format('Seu prazo acaba em %s dias. Renove para evitar bloqueio.', v_trial_days_remaining)
    );
  END IF;

  IF v_trial_expired THEN
    v_warnings := v_warnings || jsonb_build_array(
      'Seu período de teste expirou. Escolha um plano para continuar usando todas as funcionalidades.'
    );
  END IF;

  RETURN jsonb_build_object(
    'requires_onboarding', COALESCE(v_state.onboarding_status, 'pending') = 'pending',
    'onboarding_completed', COALESCE(v_state.onboarding_status, 'pending') = 'completed',
    'trial_active', v_trial_active,
    'trial_expired', v_trial_expired,
    'trial_days_remaining', v_trial_days_remaining,
    'trial_end_at', v_effective_trial_end_at,
    'requires_payment', v_trial_expired AND v_subscription IS NULL,
    'has_active_subscription', v_has_active_sub,
    'billing_complete', v_state.billing_complete,
    'requires_billing', NOT COALESCE(v_state.billing_complete, false),
    'ml_connected', COALESCE(v_state.ml_connected, false),
    'ml_is_owner', COALESCE(v_state.ml_account_role, 'none') = 'owner',
    'ml_is_collaborator', COALESCE(v_state.ml_account_role, 'none') = 'collaborator',
    'ml_requires_owner_warning', COALESCE(v_state.ml_account_role, 'none') = 'collaborator',
    'ml_api_access_allowed', COALESCE((v_api_access->>'allowed')::boolean, true),
    'ml_api_access_reason', v_api_access->>'reason',
    'ml_api_access_message', v_api_access->>'message',
    'can_print_labels', v_has_active_sub AND COALESCE(v_state.ml_connected, false),
    'can_import_sales', v_has_active_sub AND COALESCE(v_state.ml_connected, false),
    'can_access_reports', v_has_active_sub,
    'can_manage_integrations', true,
    'trial_warnings', v_warnings,
    'computed_at', now(),
    'state_version', 1
  );
END;
$$;
