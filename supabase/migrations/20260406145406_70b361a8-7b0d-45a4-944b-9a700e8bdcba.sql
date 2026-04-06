CREATE OR REPLACE FUNCTION public.check_ml_api_access(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company RECORD;
  v_subscription RECORD;
  v_entitlement RECORD;
  v_state RECORD;
  v_effective_end_at timestamptz;
  v_days_remaining integer;
BEGIN
  SELECT *
  INTO v_state
  FROM public.user_access_state
  WHERE user_id = p_user_id;

  SELECT c.*, COALESCE(c.trial_status, 'none') AS eff_trial_status
  INTO v_company
  FROM public.companies c
  WHERE c.user_id = p_user_id AND c.is_active = true
  ORDER BY c.trial_started_at DESC NULLS LAST
  LIMIT 1;

  v_effective_end_at := GREATEST(
    COALESCE(v_state.trial_end_at, '-infinity'::timestamptz),
    COALESCE(v_company.trial_ends_at, '-infinity'::timestamptz)
  );

  IF v_effective_end_at = '-infinity'::timestamptz THEN
    v_effective_end_at := NULL;
  END IF;

  IF v_effective_end_at IS NOT NULL THEN
    v_days_remaining := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_effective_end_at - now())) / 86400.0)::integer);
  ELSE
    v_days_remaining := 0;
  END IF;

  IF v_company IS NULL THEN
    IF v_state IS NOT NULL AND v_effective_end_at IS NOT NULL AND v_effective_end_at > now() THEN
      RETURN jsonb_build_object(
        'allowed', true,
        'reason', 'active_manual_period',
        'trial_ends_at', v_effective_end_at,
        'trial_days_remaining', v_days_remaining
      );
    END IF;

    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'no_company',
      'error_code', 'NO_COMPANY',
      'message', 'Nenhuma empresa encontrada.'
    );
  END IF;

  SELECT s.*, pv.plan_type, pv.slug AS plan_slug
  INTO v_subscription
  FROM public.subscriptions s
  LEFT JOIN public.plans_v2 pv ON pv.id = s.plan_id
  WHERE s.company_id = v_company.id
    AND s.status = 'active'
  LIMIT 1;

  IF v_subscription IS NOT NULL AND v_subscription.plan_type = 'zpl' THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'zpl_plan',
      'error_code', 'ZPL_PLAN',
      'message', 'Plano ZPL não inclui acesso à API do Mercado Livre.'
    );
  END IF;

  IF v_subscription IS NOT NULL AND v_subscription.status = 'active' THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'reason', 'active_subscription',
      'trial_ends_at', v_effective_end_at,
      'trial_days_remaining', v_days_remaining
    );
  END IF;

  SELECT te.*, pt.plan_group AS tier_plan_group, pt.code AS tier_code
  INTO v_entitlement
  FROM public.tenant_entitlements te
  LEFT JOIN public.plan_tiers pt ON pt.id = te.tier_id
  WHERE te.tenant_id IN (v_company.id, COALESCE(v_company.tenant_id, v_company.id))
    AND te.status = 'active'
    AND te.current_period_end > now()
  ORDER BY te.current_period_end DESC
  LIMIT 1;

  IF v_entitlement IS NOT NULL THEN
    IF v_entitlement.tier_plan_group = 'zpl' THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'zpl_plan',
        'error_code', 'ZPL_PLAN',
        'message', 'Plano ZPL não inclui acesso à API do Mercado Livre.'
      );
    END IF;

    RETURN jsonb_build_object(
      'allowed', true,
      'reason', 'active_entitlement',
      'trial_ends_at', COALESCE(v_entitlement.current_period_end, v_effective_end_at),
      'trial_days_remaining', GREATEST(0, CEIL(EXTRACT(EPOCH FROM (COALESCE(v_entitlement.current_period_end, now()) - now())) / 86400.0)::integer)
    );
  END IF;

  IF v_effective_end_at IS NOT NULL AND v_effective_end_at > now() THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'reason', CASE WHEN v_state.trial_end_at IS NOT NULL AND (v_company.trial_ends_at IS NULL OR v_state.trial_end_at >= v_company.trial_ends_at) THEN 'active_manual_period' ELSE 'active_trial' END,
      'trial_ends_at', v_effective_end_at,
      'trial_days_remaining', v_days_remaining
    );
  END IF;

  IF v_company.trial_started_at IS NOT NULL
     AND (v_company.eff_trial_status != 'expired')
     AND v_company.trial_ends_at <= now() THEN
    UPDATE public.companies
    SET trial_status = 'expired', updated_at = now()
    WHERE id = v_company.id;
  END IF;

  IF v_company.trial_started_at IS NULL AND (v_state IS NULL OR v_state.trial_end_at IS NULL) THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'no_trial',
      'error_code', 'NO_TRIAL',
      'message', 'Conecte uma conta do Mercado Livre para iniciar seu período de teste.'
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', false,
    'reason', 'trial_expired',
    'error_code', 'TRIAL_EXPIRED',
    'message', 'Seu prazo de acesso expirou. Renove o plano para continuar sincronizando.',
    'trial_ends_at', v_effective_end_at
  );
END;
$$;

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
  v_has_active_entitlement BOOLEAN;
  v_effective_trial_end_at timestamptz;
  v_effective_trial_active boolean;
  v_effective_trial_expired boolean;
  v_trial_days_remaining integer;
  v_has_manual_override boolean;
  v_trial_warnings jsonb;
BEGIN
  SELECT * INTO v_state FROM public.user_access_state WHERE user_id = p_user_id;

  IF v_state IS NULL THEN
    RETURN jsonb_build_object('error', 'no_state');
  END IF;

  IF v_state.payment_status != 'active' THEN
    SELECT EXISTS (
      SELECT 1 FROM tenant_entitlements te
      JOIN tenant_members tm ON tm.tenant_id = te.tenant_id
      WHERE tm.user_id = p_user_id
        AND te.entitlement_type = 'tier'
        AND te.status = 'active'
        AND te.current_period_end > now()
    ) INTO v_has_active_entitlement;

    IF NOT v_has_active_entitlement THEN
      SELECT EXISTS (
        SELECT 1 FROM tenant_entitlements te
        WHERE te.tenant_id::text = p_user_id::text
          AND te.entitlement_type = 'tier'
          AND te.status = 'active'
          AND te.current_period_end > now()
      ) INTO v_has_active_entitlement;
    END IF;

    IF v_has_active_entitlement THEN
      UPDATE user_access_state
      SET payment_status = 'active', trial_status = 'expired', updated_at = now()
      WHERE user_id = p_user_id;
      SELECT * INTO v_state FROM user_access_state WHERE user_id = p_user_id;
    END IF;
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

  v_effective_trial_end_at := GREATEST(
    COALESCE(v_state.trial_end_at, '-infinity'::timestamptz),
    COALESCE(v_company.trial_ends_at, '-infinity'::timestamptz)
  );

  IF v_effective_trial_end_at = '-infinity'::timestamptz THEN
    v_effective_trial_end_at := NULL;
  END IF;

  v_has_manual_override := v_state.trial_end_at IS NOT NULL
    AND (v_company IS NULL OR v_company.trial_ends_at IS NULL OR v_state.trial_end_at >= v_company.trial_ends_at);

  v_effective_trial_active := v_effective_trial_end_at IS NOT NULL AND v_effective_trial_end_at > now();
  v_effective_trial_expired := v_effective_trial_end_at IS NOT NULL AND v_effective_trial_end_at <= now();
  v_trial_days_remaining := CASE
    WHEN v_effective_trial_active
    THEN GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_effective_trial_end_at - now())) / 86400.0)::integer)
    ELSE 0
  END;

  v_api_access := public.check_ml_api_access(p_user_id);
  v_billing_complete := public.is_billing_complete(p_user_id);

  v_trial_warnings := CASE
    WHEN v_effective_trial_active AND v_trial_days_remaining <= 7 THEN jsonb_build_array(
      format('Seu prazo de acesso termina em %s dia%s. Renove o plano para evitar bloqueio.', v_trial_days_remaining, CASE WHEN v_trial_days_remaining = 1 THEN '' ELSE 's' END)
    )
    ELSE '[]'::jsonb
  END;

  v_flags := jsonb_build_object(
    'requires_onboarding', v_state.onboarding_status = 'pending',
    'onboarding_completed', v_state.onboarding_status = 'completed',
    'trial_active', v_effective_trial_active,
    'trial_expired', v_effective_trial_expired,
    'trial_days_remaining', v_trial_days_remaining,
    'trial_end_at', v_effective_trial_end_at,
    'requires_payment', (v_state.payment_status IN ('blocked', 'free') AND v_effective_trial_expired) AND NOT COALESCE((v_api_access->>'allowed')::boolean, false),
    'has_active_subscription', v_subscription IS NOT NULL OR v_state.payment_status = 'active' OR COALESCE((v_api_access->>'allowed')::boolean, false),
    'billing_complete', v_billing_complete,
    'requires_billing', (v_subscription IS NOT NULL OR v_state.payment_status = 'active') AND NOT v_billing_complete,
    'ml_connected', v_state.ml_account_connected,
    'ml_is_owner', v_state.ml_account_role = 'owner',
    'ml_is_collaborator', v_state.ml_account_role = 'collaborator',
    'ml_requires_owner_warning', v_state.ml_account_role = 'collaborator',
    'ml_api_access_allowed', COALESCE((v_api_access->>'allowed')::boolean, false),
    'ml_api_access_reason', v_api_access->>'reason',
    'ml_api_access_message', v_api_access->>'message',
    'can_print_labels', v_state.onboarding_status = 'completed',
    'can_import_sales', v_state.onboarding_status = 'completed' AND v_state.ml_account_connected,
    'can_access_reports', v_state.onboarding_status = 'completed',
    'can_manage_integrations', v_state.onboarding_status = 'completed',
    'trial_warnings', v_trial_warnings,
    'computed_at', now(),
    'state_version', 4
  );

  RETURN v_flags;
END;
$$;