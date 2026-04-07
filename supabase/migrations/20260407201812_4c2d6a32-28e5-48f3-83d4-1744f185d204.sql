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
  v_ml_role_text text;
BEGIN
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

  v_ml_role_text := COALESCE(v_state.ml_account_role::text, 'none');

  SELECT s.* INTO v_subscription
  FROM public.subscriptions s
  WHERE s.user_id = p_user_id
    AND s.status = 'active'
  ORDER BY s.created_at DESC
  LIMIT 1;

  SELECT c.* INTO v_company
  FROM public.companies c
  JOIN public.company_users cu ON cu.company_id = c.id
  WHERE cu.user_id = p_user_id
  LIMIT 1;

  v_effective_trial_end_at := GREATEST(
    COALESCE(v_state.trial_end_at, '-infinity'::timestamptz),
    COALESCE(v_company.trial_ends_at, '-infinity'::timestamptz)
  );

  IF v_effective_trial_end_at = '-infinity'::timestamptz THEN
    v_effective_trial_end_at := NULL;
  END IF;

  BEGIN
    v_api_access := public.check_ml_api_access(p_user_id);
  EXCEPTION WHEN OTHERS THEN
    v_api_access := jsonb_build_object('allowed', true, 'reason', 'check_failed');
  END;

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

  v_has_active_sub := (
    v_subscription IS NOT NULL
    OR v_state.payment_status = 'active'
    OR (v_state.payment_status = 'trial' AND v_effective_trial_end_at IS NOT NULL AND v_effective_trial_end_at > now())
    OR COALESCE((v_api_access->>'allowed')::boolean, false)
  );

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
    'billing_complete', v_state.payment_status IN ('active', 'trial'),
    'requires_billing', v_trial_expired AND v_subscription IS NULL,
    'ml_connected', COALESCE(v_state.ml_account_connected, false),
    'ml_is_owner', v_ml_role_text = 'owner',
    'ml_is_collaborator', v_ml_role_text = 'collaborator',
    'ml_requires_owner_warning', v_ml_role_text = 'collaborator',
    'ml_api_access_allowed', COALESCE((v_api_access->>'allowed')::boolean, true),
    'ml_api_access_reason', v_api_access->>'reason',
    'ml_api_access_message', v_api_access->>'message',
    'can_print_labels', v_has_active_sub OR v_trial_active,
    'can_import_sales', v_has_active_sub OR v_trial_active,
    'can_access_reports', v_has_active_sub OR v_trial_active,
    'can_manage_integrations', true,
    'trial_warnings', v_warnings,
    'computed_at', now(),
    'state_version', 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_activate_entitlement(
  p_tenant_id uuid,
  p_entitlement_type text,
  p_tier_code text DEFAULT NULL,
  p_addon_code text DEFAULT NULL,
  p_offer_code text DEFAULT NULL,
  p_payment_id text DEFAULT NULL,
  p_external_reference text DEFAULT NULL,
  p_auto_renew boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tier_id uuid;
  v_addon_id uuid;
  v_offer_id uuid;
  v_period_months int;
  v_period_end timestamptz;
  v_entitlement_id uuid;
  v_existing_same_payment uuid;
BEGIN
  IF p_payment_id IS NOT NULL THEN
    SELECT id INTO v_existing_same_payment
    FROM public.tenant_entitlements
    WHERE tenant_id = p_tenant_id
      AND entitlement_type = p_entitlement_type
      AND last_payment_id = p_payment_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing_same_payment IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'entitlement_id', v_existing_same_payment,
        'skipped', true,
        'reason', 'duplicate_payment_id'
      );
    END IF;
  END IF;

  IF p_entitlement_type = 'tier' THEN
    SELECT id INTO v_tier_id FROM public.plan_tiers WHERE code = p_tier_code AND is_active = true;
    IF v_tier_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Tier not found: ' || p_tier_code);
    END IF;

    SELECT id, period_months INTO v_offer_id, v_period_months
    FROM public.plan_offers WHERE tier_id = v_tier_id AND offer_code = p_offer_code AND is_active = true;
    IF v_offer_id IS NULL THEN
      v_period_months := 1;
    END IF;

    UPDATE public.tenant_entitlements
    SET status = 'canceled', updated_at = now()
    WHERE tenant_id = p_tenant_id AND entitlement_type = 'tier' AND status IN ('active', 'trial', 'past_due');
  ELSIF p_entitlement_type = 'addon' THEN
    SELECT id INTO v_addon_id FROM public.plan_addons WHERE code = p_addon_code AND is_active = true;
    IF v_addon_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Addon not found: ' || p_addon_code);
    END IF;

    SELECT id, period_months INTO v_offer_id, v_period_months
    FROM public.plan_addon_offers WHERE addon_id = v_addon_id AND offer_code = p_offer_code AND is_active = true;
    IF v_offer_id IS NULL THEN
      v_period_months := 1;
    END IF;

    UPDATE public.tenant_entitlements
    SET status = 'canceled', updated_at = now()
    WHERE tenant_id = p_tenant_id AND entitlement_type = 'addon' AND addon_id = v_addon_id AND status IN ('active', 'trial', 'past_due');
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid entitlement_type');
  END IF;

  v_period_end := now() + (v_period_months || ' months')::interval;

  INSERT INTO public.tenant_entitlements (
    tenant_id, entitlement_type, tier_id, addon_id, offer_id,
    status, current_period_start, current_period_end, auto_renew, source,
    last_payment_id, last_external_reference
  ) VALUES (
    p_tenant_id, p_entitlement_type, v_tier_id, v_addon_id, v_offer_id,
    'active', now(), v_period_end, p_auto_renew, 'mercadopago',
    p_payment_id, p_external_reference
  )
  RETURNING id INTO v_entitlement_id;

  INSERT INTO public.audit_logs (tenant_id, action, entity_type, entity_id, metadata)
  VALUES (p_tenant_id, 'entitlement_activated', 'tenant_entitlements', v_entitlement_id,
    jsonb_build_object(
      'type', p_entitlement_type, 'tier_code', p_tier_code, 'addon_code', p_addon_code,
      'offer_code', p_offer_code, 'period_months', v_period_months,
      'period_end', v_period_end, 'payment_id', p_payment_id, 'auto_renew', p_auto_renew
    ));

  RETURN jsonb_build_object(
    'success', true, 'entitlement_id', v_entitlement_id,
    'period_end', v_period_end, 'period_months', v_period_months
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_renew_entitlement(
  p_tenant_id uuid,
  p_entitlement_type text,
  p_payment_id text DEFAULT NULL,
  p_external_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_ent record;
  v_period_months int;
  v_new_end timestamptz;
BEGIN
  SELECT e.*, COALESCE(o.period_months, ao.period_months, 1) as resolved_period
  INTO v_ent
  FROM public.tenant_entitlements e
  LEFT JOIN public.plan_offers o ON o.id = e.offer_id
  LEFT JOIN public.plan_addon_offers ao ON ao.id = e.offer_id
  WHERE e.tenant_id = p_tenant_id
    AND e.entitlement_type = p_entitlement_type
    AND e.status IN ('active', 'past_due')
  ORDER BY e.created_at DESC
  LIMIT 1;

  IF v_ent IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active entitlement found');
  END IF;

  IF p_payment_id IS NOT NULL AND v_ent.last_payment_id = p_payment_id THEN
    RETURN jsonb_build_object(
      'success', true,
      'skipped', true,
      'reason', 'duplicate_payment_id',
      'current_period_end', v_ent.current_period_end
    );
  END IF;

  v_period_months := v_ent.resolved_period;
  v_new_end := GREATEST(v_ent.current_period_end, now()) + (v_period_months || ' months')::interval;

  UPDATE public.tenant_entitlements
  SET status = 'active', current_period_end = v_new_end,
      last_payment_id = COALESCE(p_payment_id, last_payment_id),
      last_external_reference = COALESCE(p_external_reference, last_external_reference),
      updated_at = now()
  WHERE id = v_ent.id;

  INSERT INTO public.audit_logs (tenant_id, action, entity_type, entity_id, metadata)
  VALUES (p_tenant_id, 'entitlement_renewed', 'tenant_entitlements', v_ent.id,
    jsonb_build_object('period_months', v_period_months, 'new_end', v_new_end, 'payment_id', p_payment_id));

  RETURN jsonb_build_object('success', true, 'new_period_end', v_new_end);
END;
$$;