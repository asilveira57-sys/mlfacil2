
-- ================================================================
-- STRUCTURAL FIX: Unified entitlement-aware access resolution
-- ================================================================

-- 1. Fix check_ml_api_access to resolve company via ALL paths
CREATE OR REPLACE FUNCTION public.check_ml_api_access(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company RECORD;
  v_subscription RECORD;
  v_entitlement RECORD;
  v_state RECORD;
  v_effective_end_at timestamptz;
  v_days_remaining integer;
BEGIN
  SELECT * INTO v_state
  FROM public.user_access_state
  WHERE user_id = p_user_id;

  -- Resolve company via company_users FIRST (preferred), then fallback to companies.user_id
  SELECT c.*, COALESCE(c.trial_status, 'none') AS eff_trial_status
  INTO v_company
  FROM public.companies c
  JOIN public.company_users cu ON cu.company_id = c.id
  WHERE cu.user_id = p_user_id AND c.is_active = true
  ORDER BY c.is_primary DESC NULLS LAST, c.created_at ASC
  LIMIT 1;

  IF v_company IS NULL THEN
    SELECT c.*, COALESCE(c.trial_status, 'none') AS eff_trial_status
    INTO v_company
    FROM public.companies c
    WHERE c.user_id = p_user_id AND c.is_active = true
    ORDER BY c.trial_started_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  -- Calculate effective trial end
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

  -- ═══ PRIORITY 1: Check tenant_entitlements (new system) via ALL paths ═══
  -- Check via company.id AND company.tenant_id
  IF v_company IS NOT NULL THEN
    SELECT te.*, pt.plan_group AS tier_plan_group, pt.code AS tier_code
    INTO v_entitlement
    FROM public.tenant_entitlements te
    LEFT JOIN public.plan_tiers pt ON pt.id = te.tier_id
    WHERE te.tenant_id IN (v_company.id, COALESCE(v_company.tenant_id, v_company.id))
      AND te.status = 'active'
      AND te.current_period_end > now()
    ORDER BY te.current_period_end DESC
    LIMIT 1;
  END IF;

  -- Also check via tenant_members (direct user-tenant link)
  IF v_entitlement IS NULL THEN
    SELECT te.*, pt.plan_group AS tier_plan_group, pt.code AS tier_code
    INTO v_entitlement
    FROM public.tenant_entitlements te
    LEFT JOIN public.plan_tiers pt ON pt.id = te.tier_id
    JOIN public.tenant_members tm ON tm.tenant_id = te.tenant_id
    WHERE tm.user_id = p_user_id
      AND te.status = 'active'
      AND te.current_period_end > now()
    ORDER BY te.current_period_end DESC
    LIMIT 1;
  END IF;

  -- If entitlement found, it takes absolute priority
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

  -- ═══ PRIORITY 2: Check payment_status = active on user_access_state ═══
  IF v_state IS NOT NULL AND v_state.payment_status = 'active' THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'reason', 'active_payment_status',
      'trial_ends_at', v_effective_end_at,
      'trial_days_remaining', v_days_remaining
    );
  END IF;

  -- ═══ PRIORITY 3: Legacy subscriptions ═══
  IF v_company IS NOT NULL THEN
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
  END IF;

  -- ═══ PRIORITY 4: Active trial period ═══
  IF v_effective_end_at IS NOT NULL AND v_effective_end_at > now() THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'reason', CASE
        WHEN v_state IS NOT NULL AND v_state.trial_end_at IS NOT NULL
             AND (v_company IS NULL OR v_company.trial_ends_at IS NULL OR v_state.trial_end_at >= v_company.trial_ends_at)
        THEN 'active_manual_period'
        ELSE 'active_trial'
      END,
      'trial_ends_at', v_effective_end_at,
      'trial_days_remaining', v_days_remaining
    );
  END IF;

  -- ═══ No company at all ═══
  IF v_company IS NULL THEN
    IF v_state IS NOT NULL AND v_state.trial_end_at IS NOT NULL AND v_state.trial_end_at > now() THEN
      RETURN jsonb_build_object(
        'allowed', true,
        'reason', 'active_manual_period',
        'trial_ends_at', v_state.trial_end_at,
        'trial_days_remaining', GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_state.trial_end_at - now())) / 86400.0)::integer)
      );
    END IF;

    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'no_company',
      'error_code', 'NO_COMPANY',
      'message', 'Nenhuma empresa encontrada.'
    );
  END IF;

  -- Update expired trial status
  IF v_company.trial_started_at IS NOT NULL
     AND v_company.eff_trial_status != 'expired'
     AND v_company.trial_ends_at IS NOT NULL
     AND v_company.trial_ends_at <= now() THEN
    UPDATE public.companies
    SET trial_status = 'expired', updated_at = now()
    WHERE id = v_company.id;
  END IF;

  -- No trial ever started
  IF v_company.trial_started_at IS NULL AND (v_state IS NULL OR v_state.trial_end_at IS NULL) THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'no_trial',
      'error_code', 'NO_TRIAL',
      'message', 'Conecte uma conta do Mercado Livre para iniciar seu período de teste.'
    );
  END IF;

  -- Trial expired, no active plan
  RETURN jsonb_build_object(
    'allowed', false,
    'reason', 'trial_expired',
    'error_code', 'TRIAL_EXPIRED',
    'message', 'Seu prazo de acesso expirou. Renove o plano para continuar sincronizando.',
    'trial_ends_at', v_effective_end_at
  );
END;
$function$;


-- 2. Fix get_user_feature_flags with direct entitlement self-healing
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
  -- This ensures that even if payment_status is stale, we detect active entitlements
  IF v_state.payment_status != 'active' THEN
    -- Path 1: via company_users → companies → tenant_entitlements
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

    -- Path 2: via tenant_members
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

    -- Path 3: via companies.user_id (legacy)
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

    -- Self-heal: fix stale payment_status
    IF v_has_direct_entitlement THEN
      UPDATE public.user_access_state
      SET payment_status = 'active', trial_status = 'expired', updated_at = now()
      WHERE user_id = p_user_id;
      -- Reload state
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

  -- Company resolution via company_users (preferred)
  SELECT c.* INTO v_company
  FROM public.companies c
  JOIN public.company_users cu ON cu.company_id = c.id
  WHERE cu.user_id = p_user_id
  LIMIT 1;

  -- Fallback to companies.user_id
  IF v_company IS NULL THEN
    SELECT c.* INTO v_company
    FROM public.companies c
    WHERE c.user_id = p_user_id AND c.is_active = true
    ORDER BY c.created_at ASC
    LIMIT 1;
  END IF;

  -- Effective trial end
  v_effective_trial_end_at := GREATEST(
    COALESCE(v_state.trial_end_at, '-infinity'::timestamptz),
    COALESCE(v_company.trial_ends_at, '-infinity'::timestamptz)
  );
  IF v_effective_trial_end_at = '-infinity'::timestamptz THEN
    v_effective_trial_end_at := NULL;
  END IF;

  -- Use entitlement end as effective end if it's later
  IF v_has_direct_entitlement AND v_entitlement_end IS NOT NULL THEN
    v_effective_trial_end_at := GREATEST(
      COALESCE(v_effective_trial_end_at, '-infinity'::timestamptz),
      v_entitlement_end
    );
  END IF;

  -- ML API access check
  BEGIN
    v_api_access := public.check_ml_api_access(p_user_id);
  EXCEPTION WHEN OTHERS THEN
    v_api_access := jsonb_build_object('allowed', true, 'reason', 'check_failed');
  END;

  -- Trial status calculations
  v_trial_active := (
    v_effective_trial_end_at IS NOT NULL
    AND v_effective_trial_end_at > now()
    AND v_state.payment_status IN ('trial', 'free')
  );

  -- CRITICAL: trial_expired is FALSE if payment_status = 'active' or entitlement exists
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

  -- has_active_sub: TRUE if ANY path confirms active access
  v_has_active_sub := (
    v_subscription IS NOT NULL
    OR v_state.payment_status = 'active'
    OR v_has_direct_entitlement
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
    'requires_payment', v_trial_expired AND v_subscription IS NULL AND NOT v_has_direct_entitlement,
    'has_active_subscription', v_has_active_sub,
    'billing_complete', v_state.payment_status IN ('active', 'trial'),
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
    'state_version', 2
  );
END;
$function$;


-- 3. Fix rpc_activate_entitlement (uuid version) to sync via company_users too
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
  -- Idempotency: skip if same payment_id already processed
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

  -- ═══ SYNC user_access_state via ALL paths ═══

  -- Path 1: tenant_members (direct user-tenant link)
  UPDATE public.user_access_state
  SET payment_status = 'active', trial_status = 'expired', updated_at = now()
  WHERE user_id IN (
    SELECT user_id FROM public.tenant_members WHERE tenant_id = p_tenant_id
  ) AND payment_status != 'active';

  -- Path 2: company_users (company linked to tenant)
  UPDATE public.user_access_state
  SET payment_status = 'active', trial_status = 'expired', updated_at = now()
  WHERE user_id IN (
    SELECT cu.user_id
    FROM public.company_users cu
    JOIN public.companies c ON c.id = cu.company_id
    WHERE c.id = p_tenant_id OR c.tenant_id = p_tenant_id
  ) AND payment_status != 'active';

  -- Path 3: companies.user_id (legacy direct owner)
  UPDATE public.user_access_state
  SET payment_status = 'active', trial_status = 'expired', updated_at = now()
  WHERE user_id IN (
    SELECT c.user_id FROM public.companies c
    WHERE (c.id = p_tenant_id OR c.tenant_id = p_tenant_id) AND c.user_id IS NOT NULL
  ) AND payment_status != 'active';

  -- Path 4: tenant_id = user_id fallback
  UPDATE public.user_access_state
  SET payment_status = 'active', trial_status = 'expired', updated_at = now()
  WHERE user_id = p_tenant_id
    AND payment_status != 'active';

  -- Audit log
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


-- 4. Fix admin_get_clients_overview to resolve company via company_users
CREATE OR REPLACE FUNCTION public.admin_get_clients_overview()
RETURNS TABLE(
  user_id uuid, full_name text, email text, whatsapp text, cpf text, photo_url text,
  profile_created_at timestamptz, onboarding_status text, trial_status text,
  trial_start_at timestamptz, trial_end_at timestamptz, selected_plan_id uuid,
  payment_status text, ml_account_connected boolean,
  company_id uuid, company_name text, company_document text, company_city text, company_state text,
  ml_accounts jsonb, roles text[], last_sign_in_at timestamptz, last_activity_at timestamptz, tag text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    au.id AS user_id,
    p.full_name,
    COALESCE(p.email, au.email) AS email,
    p.whatsapp,
    p.cpf,
    p.photo_url,
    COALESCE(p.created_at, au.created_at) AS profile_created_at,
    uas.onboarding_status::text,
    uas.trial_status::text,
    uas.trial_start_at,
    uas.trial_end_at,
    uas.selected_plan_id,
    uas.payment_status::text,
    uas.ml_account_connected,
    COALESCE(cu_co.id, legacy_co.id) AS company_id,
    COALESCE(cu_co.display_name, legacy_co.display_name) AS company_name,
    COALESCE(cu_co.document_number, legacy_co.document_number) AS company_document,
    COALESCE(cu_co.city, legacy_co.city) AS company_city,
    COALESCE(cu_co.state, legacy_co.state) AS company_state,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'id', ma.id,
        'nickname', ma.nickname,
        'ml_user_id', ma.ml_user_id,
        'connection_status', ma.connection_status,
        'is_active', ma.is_active,
        'created_at', ma.created_at,
        'last_activity_at', (SELECT MAX(umu.last_seen_at) FROM user_module_usage umu WHERE umu.seller_id = ma.id)
      ))
      FROM ml_accounts ma WHERE ma.user_id = au.id),
      '[]'::jsonb
    ) AS ml_accounts,
    COALESCE(
      ARRAY(SELECT ur.role::text FROM user_roles ur WHERE ur.user_id = au.id),
      '{}'::text[]
    ) AS roles,
    au.last_sign_in_at,
    (SELECT MAX(umu2.last_seen_at) FROM user_module_usage umu2 WHERE umu2.user_id = au.id) AS last_activity_at,
    p.tag
  FROM auth.users au
  LEFT JOIN profiles p ON p.user_id = au.id
  LEFT JOIN user_access_state uas ON uas.user_id = au.id
  -- Preferred: company via company_users
  LEFT JOIN LATERAL (
    SELECT co.id, co.display_name, co.document_number, co.city, co.state
    FROM company_users cuu
    JOIN companies co ON co.id = cuu.company_id AND co.is_active = true
    WHERE cuu.user_id = au.id
    ORDER BY co.is_primary DESC NULLS LAST, co.created_at ASC
    LIMIT 1
  ) cu_co ON true
  -- Fallback: company via companies.user_id (legacy)
  LEFT JOIN LATERAL (
    SELECT co.id, co.display_name, co.document_number, co.city, co.state
    FROM companies co
    WHERE co.user_id = au.id AND co.is_active = true AND cu_co.id IS NULL
    ORDER BY co.is_primary DESC NULLS LAST, co.created_at ASC
    LIMIT 1
  ) legacy_co ON true
  WHERE has_role(auth.uid(), 'admin')
  ORDER BY au.created_at DESC;
$function$;


-- 5. Backfill: sync user_access_state for ALL users with active entitlements
UPDATE public.user_access_state uas
SET payment_status = 'active', trial_status = 'expired', updated_at = now()
WHERE uas.payment_status != 'active'
  AND EXISTS (
    -- Via company_users
    SELECT 1
    FROM public.tenant_entitlements te
    JOIN public.companies c ON c.id = te.tenant_id OR c.tenant_id = te.tenant_id
    JOIN public.company_users cu ON cu.company_id = c.id
    WHERE cu.user_id = uas.user_id
      AND te.entitlement_type = 'tier'
      AND te.status = 'active'
      AND te.current_period_end > now()
  );

UPDATE public.user_access_state uas
SET payment_status = 'active', trial_status = 'expired', updated_at = now()
WHERE uas.payment_status != 'active'
  AND EXISTS (
    -- Via tenant_members
    SELECT 1
    FROM public.tenant_entitlements te
    JOIN public.tenant_members tm ON tm.tenant_id = te.tenant_id
    WHERE tm.user_id = uas.user_id
      AND te.entitlement_type = 'tier'
      AND te.status = 'active'
      AND te.current_period_end > now()
  );

UPDATE public.user_access_state uas
SET payment_status = 'active', trial_status = 'expired', updated_at = now()
WHERE uas.payment_status != 'active'
  AND EXISTS (
    -- Via companies.user_id (legacy)
    SELECT 1
    FROM public.tenant_entitlements te
    JOIN public.companies c ON c.id = te.tenant_id OR c.tenant_id = te.tenant_id
    WHERE c.user_id = uas.user_id AND c.is_active = true
      AND te.entitlement_type = 'tier'
      AND te.status = 'active'
      AND te.current_period_end > now()
  );
