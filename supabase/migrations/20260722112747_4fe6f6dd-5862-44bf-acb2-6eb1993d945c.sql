CREATE OR REPLACE FUNCTION public.check_ml_api_access(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_company_tenant_id uuid;
  v_trial_ends_at timestamptz;
  v_trial_started_at timestamptz;
  v_state_trial_end_at timestamptz;
  v_state_payment_status text;
  v_effective_end_at timestamptz;
  v_days_remaining integer;
  v_ent_id uuid;
  v_ent_plan_group text;
  v_ent_period_end timestamptz;
  v_sub_status text;
  v_sub_plan_type text;
  v_titular_user_id uuid;
  v_inherited_from_collaborator boolean := false;
BEGIN
  -- ══════════════════════════════════════════════════════════
  -- STEP 0 (novo): Colaborador herda plano do titular
  -- Se p_user_id corresponde a um colaborador ativo, substituímos
  -- pelo user_id do titular (collaborators.created_by) antes de
  -- checar qualquer plano/entitlement. Mantém paridade com a
  -- resolução já feita no frontend (useCanAccessModule).
  -- ══════════════════════════════════════════════════════════
  SELECT c.created_by
  INTO v_titular_user_id
  FROM public.collaborators c
  WHERE c.auth_user_id = p_user_id
    AND c.status = 'active'
    AND c.deleted_at IS NULL
  ORDER BY c.created_at ASC
  LIMIT 1;

  IF v_titular_user_id IS NOT NULL AND v_titular_user_id <> p_user_id THEN
    p_user_id := v_titular_user_id;
    v_inherited_from_collaborator := true;
  END IF;

  -- ══════════════════════════════════════════════════════════
  -- STEP 1: Load user_access_state
  -- ══════════════════════════════════════════════════════════
  SELECT uas.payment_status::text, uas.trial_end_at
  INTO v_state_payment_status, v_state_trial_end_at
  FROM public.user_access_state uas
  WHERE uas.user_id = p_user_id;

  -- ══════════════════════════════════════════════════════════
  -- STEP 2: Resolve company (company_users first, then companies.user_id)
  -- ══════════════════════════════════════════════════════════
  SELECT c.id, c.tenant_id, c.trial_ends_at, c.trial_started_at
  INTO v_company_id, v_company_tenant_id, v_trial_ends_at, v_trial_started_at
  FROM public.companies c
  JOIN public.company_users cu ON cu.company_id = c.id
  WHERE cu.user_id = p_user_id AND c.is_active = true
  ORDER BY c.is_primary DESC NULLS LAST, c.created_at ASC
  LIMIT 1;

  IF v_company_id IS NULL THEN
    SELECT c.id, c.tenant_id, c.trial_ends_at, c.trial_started_at
    INTO v_company_id, v_company_tenant_id, v_trial_ends_at, v_trial_started_at
    FROM public.companies c
    WHERE c.user_id = p_user_id AND c.is_active = true
    ORDER BY c.trial_started_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  v_effective_end_at := GREATEST(
    COALESCE(v_state_trial_end_at, '-infinity'::timestamptz),
    COALESCE(v_trial_ends_at, '-infinity'::timestamptz)
  );
  IF v_effective_end_at = '-infinity'::timestamptz THEN
    v_effective_end_at := NULL;
  END IF;

  IF v_effective_end_at IS NOT NULL THEN
    v_days_remaining := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_effective_end_at - now())) / 86400.0)::integer);
  ELSE
    v_days_remaining := 0;
  END IF;

  -- PRIORITY 1: Active entitlement
  IF v_company_id IS NOT NULL THEN
    SELECT te.id, pt.plan_group, te.current_period_end
    INTO v_ent_id, v_ent_plan_group, v_ent_period_end
    FROM public.tenant_entitlements te
    LEFT JOIN public.plan_tiers pt ON pt.id = te.tier_id
    WHERE te.tenant_id IN (v_company_id, COALESCE(v_company_tenant_id, v_company_id))
      AND te.status = 'active'
      AND te.current_period_end > now()
    ORDER BY te.current_period_end DESC
    LIMIT 1;
  END IF;

  IF v_ent_id IS NULL THEN
    SELECT te.id, pt.plan_group, te.current_period_end
    INTO v_ent_id, v_ent_plan_group, v_ent_period_end
    FROM public.tenant_entitlements te
    LEFT JOIN public.plan_tiers pt ON pt.id = te.tier_id
    JOIN public.tenant_members tm ON tm.tenant_id = te.tenant_id
    WHERE tm.user_id = p_user_id
      AND te.status = 'active'
      AND te.current_period_end > now()
    ORDER BY te.current_period_end DESC
    LIMIT 1;
  END IF;

  IF v_ent_id IS NOT NULL THEN
    IF v_ent_plan_group = 'zpl' THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'zpl_plan',
        'error_code', 'ZPL_PLAN',
        'message', 'Plano ZPL não inclui acesso à API do Mercado Livre.',
        'inherited_from_collaborator', v_inherited_from_collaborator
      );
    END IF;

    RETURN jsonb_build_object(
      'allowed', true,
      'reason', 'active_entitlement',
      'trial_ends_at', COALESCE(v_ent_period_end, v_effective_end_at),
      'trial_days_remaining', GREATEST(0, CEIL(EXTRACT(EPOCH FROM (COALESCE(v_ent_period_end, now()) - now())) / 86400.0)::integer),
      'inherited_from_collaborator', v_inherited_from_collaborator
    );
  END IF;

  -- PRIORITY 2: payment_status active
  IF v_state_payment_status = 'active' THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'reason', 'active_payment_status',
      'trial_ends_at', v_effective_end_at,
      'trial_days_remaining', v_days_remaining,
      'inherited_from_collaborator', v_inherited_from_collaborator
    );
  END IF;

  -- PRIORITY 3: Legacy subscriptions
  IF v_company_id IS NOT NULL THEN
    SELECT s.status, pv.plan_type
    INTO v_sub_status, v_sub_plan_type
    FROM public.subscriptions s
    LEFT JOIN public.plans_v2 pv ON pv.id = s.plan_id
    WHERE s.company_id = v_company_id
      AND s.status = 'active'
    LIMIT 1;

    IF v_sub_status IS NOT NULL AND v_sub_plan_type = 'zpl' THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'zpl_plan',
        'error_code', 'ZPL_PLAN',
        'message', 'Plano ZPL não inclui acesso à API do Mercado Livre.',
        'inherited_from_collaborator', v_inherited_from_collaborator
      );
    END IF;

    IF v_sub_status IS NOT NULL THEN
      RETURN jsonb_build_object(
        'allowed', true,
        'reason', 'active_subscription',
        'trial_ends_at', v_effective_end_at,
        'trial_days_remaining', v_days_remaining,
        'inherited_from_collaborator', v_inherited_from_collaborator
      );
    END IF;
  END IF;

  -- PRIORITY 4: Active trial
  IF v_effective_end_at IS NOT NULL AND v_effective_end_at > now() THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'reason', CASE
        WHEN v_state_trial_end_at IS NOT NULL
             AND (v_trial_ends_at IS NULL OR v_state_trial_end_at >= v_trial_ends_at)
        THEN 'active_manual_period'
        ELSE 'active_trial'
      END,
      'trial_ends_at', v_effective_end_at,
      'trial_days_remaining', v_days_remaining,
      'inherited_from_collaborator', v_inherited_from_collaborator
    );
  END IF;

  IF v_company_id IS NULL THEN
    IF v_state_trial_end_at IS NOT NULL AND v_state_trial_end_at > now() THEN
      RETURN jsonb_build_object(
        'allowed', true,
        'reason', 'active_manual_period',
        'trial_ends_at', v_state_trial_end_at,
        'trial_days_remaining', GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_state_trial_end_at - now())) / 86400.0)::integer),
        'inherited_from_collaborator', v_inherited_from_collaborator
      );
    END IF;

    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'no_company',
      'error_code', 'NO_COMPANY',
      'message', 'Nenhuma empresa encontrada.',
      'inherited_from_collaborator', v_inherited_from_collaborator
    );
  END IF;

  IF v_trial_started_at IS NULL AND v_state_trial_end_at IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'no_trial',
      'error_code', 'NO_TRIAL',
      'message', 'Conecte uma conta do Mercado Livre para iniciar seu período de teste.',
      'inherited_from_collaborator', v_inherited_from_collaborator
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', false,
    'reason', 'trial_expired',
    'error_code', 'TRIAL_EXPIRED',
    'message', 'Seu prazo de acesso expirou. Renove o plano para continuar sincronizando.',
    'trial_ends_at', v_effective_end_at,
    'inherited_from_collaborator', v_inherited_from_collaborator
  );
END;
$function$;