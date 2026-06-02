
CREATE OR REPLACE FUNCTION public.get_user_feature_flags(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_has_direct_entitlement boolean := false;
  v_entitlement_end timestamptz;
  v_inherited_end timestamptz;
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

  -- ═══ SELF-HEALING: Direct entitlement check via ALL paths ═══
  IF v_state.payment_status != 'active' THEN
    SELECT te.current_period_end INTO v_entitlement_end
    FROM public.tenant_entitlements te
    JOIN public.companies c ON c.id = te.tenant_id OR c.tenant_id = te.tenant_id
    JOIN public.company_users cu ON cu.company_id = c.id
    WHERE cu.user_id = p_user_id
      AND te.entitlement_type = 'tier'
      AND te.status = 'active'
      AND te.current_period_end > now()
    ORDER BY te.current_period_end DESC
    LIMIT 1;

    IF v_entitlement_end IS NOT NULL THEN
      v_has_direct_entitlement := true;
    END IF;

    IF NOT v_has_direct_entitlement THEN
      SELECT te.current_period_end INTO v_entitlement_end
      FROM public.tenant_entitlements te
      JOIN public.tenant_members tm ON tm.tenant_id = te.tenant_id
      WHERE tm.user_id = p_user_id
        AND te.entitlement_type = 'tier'
        AND te.status = 'active'
        AND te.current_period_end > now()
      ORDER BY te.current_period_end DESC
      LIMIT 1;

      IF v_entitlement_end IS NOT NULL THEN
        v_has_direct_entitlement := true;
      END IF;
    END IF;

    IF NOT v_has_direct_entitlement THEN
      SELECT te.current_period_end INTO v_entitlement_end
      FROM public.tenant_entitlements te
      JOIN public.companies c ON c.id = te.tenant_id OR c.tenant_id = te.tenant_id
      WHERE c.user_id = p_user_id AND c.is_active = true
        AND te.entitlement_type = 'tier'
        AND te.status = 'active'
        AND te.current_period_end > now()
      ORDER BY te.current_period_end DESC
      LIMIT 1;

      IF v_entitlement_end IS NOT NULL THEN
        v_has_direct_entitlement := true;
      END IF;
    END IF;

    -- ═══ NEW: Inheritance from workspace titular (admin) ═══
    -- If user is a collaborator in a workspace, inherit access from the workspace admin.
    -- This covers trial AND paid plans of the titular account.
    IF NOT v_has_direct_entitlement THEN
      SELECT GREATEST(
        COALESCE(MAX(adm_state.trial_end_at) FILTER (
          WHERE adm_state.payment_status IN ('trial','active')
            AND adm_state.trial_end_at > now()
        ), '-infinity'::timestamptz),
        COALESCE(MAX(te.current_period_end) FILTER (
          WHERE te.status = 'active' AND te.current_period_end > now()
        ), '-infinity'::timestamptz),
        CASE WHEN bool_or(adm_state.payment_status = 'active') THEN 'infinity'::timestamptz ELSE '-infinity'::timestamptz END
      ) INTO v_inherited_end
      FROM public.workspace_members wm_self
      JOIN public.workspace_members wm_admin
        ON wm_admin.workspace_id = wm_self.workspace_id
       AND wm_admin.role = 'admin'
       AND wm_admin.user_id <> p_user_id
      LEFT JOIN public.user_access_state adm_state
        ON adm_state.user_id = wm_admin.user_id
      LEFT JOIN public.tenant_members tm_admin
        ON tm_admin.user_id = wm_admin.user_id
      LEFT JOIN public.tenant_entitlements te
        ON te.tenant_id = tm_admin.tenant_id
       AND te.entitlement_type = 'tier'
      WHERE wm_self.user_id = p_user_id
        AND wm_self.role <> 'admin';

      IF v_inherited_end IS NOT NULL AND v_inherited_end > now() THEN
        v_has_direct_entitlement := true;
        v_entitlement_end := v_inherited_end;
      END IF;
    END IF;

    -- Self-heal: fix stale payment_status (only when not inherited-infinity, to avoid storing infinity)
    IF v_has_direct_entitlement AND v_entitlement_end <> 'infinity'::timestamptz THEN
      UPDATE public.user_access_state
      SET payment_status = 'active', trial_status = 'expired', updated_at = now()
      WHERE user_id = p_user_id;
      SELECT * INTO v_state FROM public.user_access_state WHERE user_id = p_user_id;
    END IF;
  END IF;

  -- Legacy subscription check
  SELECT s.* INTO v_subscription
  FROM public.subscriptions s
  WHERE s.user_id = p_user_id
    AND s.status = 'active'
  ORDER BY s.created_at DESC
  LIMIT 1;

  v_effective_trial_end_at := COALESCE(v_state.trial_end_at, '-infinity'::timestamptz);
  IF v_effective_trial_end_at = '-infinity'::timestamptz THEN
    v_effective_trial_end_at := NULL;
  END IF;

  IF v_has_direct_entitlement AND v_entitlement_end IS NOT NULL AND v_entitlement_end <> 'infinity'::timestamptz THEN
    v_effective_trial_end_at := GREATEST(
      COALESCE(v_effective_trial_end_at, '-infinity'::timestamptz),
      v_entitlement_end
    );
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
    AND NOT v_has_direct_entitlement
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
    OR v_has_direct_entitlement
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
    'requires_payment', v_trial_expired AND v_subscription IS NULL AND NOT v_has_direct_entitlement,
    'has_active_subscription', v_has_active_sub,
    'billing_complete', v_state.payment_status IN ('active', 'trial') OR v_has_direct_entitlement,
    'requires_billing', v_trial_expired AND v_subscription IS NULL AND NOT v_has_direct_entitlement,
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
    'state_version', 3
  );
END;
$function$;
