
-- Part 1: Update rpc_activate_entitlement to sync user_access_state
CREATE OR REPLACE FUNCTION public.rpc_activate_entitlement(
  p_tenant_id text,
  p_entitlement_type text,
  p_tier_code text DEFAULT NULL,
  p_addon_code text DEFAULT NULL,
  p_offer_code text DEFAULT NULL,
  p_payment_id text DEFAULT NULL,
  p_external_reference text DEFAULT NULL,
  p_auto_renew boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier_id uuid;
  v_addon_id uuid;
  v_offer_id uuid;
  v_period_months int;
  v_period_end timestamptz;
  v_entitlement_id uuid;
BEGIN
  IF p_entitlement_type = 'tier' THEN
    SELECT id INTO v_tier_id FROM plan_tiers WHERE code = p_tier_code AND is_active = true;
    IF v_tier_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Tier not found: ' || p_tier_code);
    END IF;
    SELECT id, period_months INTO v_offer_id, v_period_months 
    FROM plan_offers WHERE tier_id = v_tier_id AND offer_code = p_offer_code AND is_active = true;
    IF v_offer_id IS NULL THEN
      v_period_months := 1;
    END IF;
    UPDATE tenant_entitlements 
    SET status = 'canceled', updated_at = now()
    WHERE tenant_id = p_tenant_id AND entitlement_type = 'tier' AND status IN ('active', 'trial', 'past_due');
    
  ELSIF p_entitlement_type = 'addon' THEN
    SELECT id INTO v_addon_id FROM plan_addons WHERE code = p_addon_code AND is_active = true;
    IF v_addon_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Addon not found: ' || p_addon_code);
    END IF;
    SELECT id, period_months INTO v_offer_id, v_period_months
    FROM plan_addon_offers WHERE addon_id = v_addon_id AND offer_code = p_offer_code AND is_active = true;
    IF v_offer_id IS NULL THEN
      v_period_months := 1;
    END IF;
    UPDATE tenant_entitlements 
    SET status = 'canceled', updated_at = now()
    WHERE tenant_id = p_tenant_id AND entitlement_type = 'addon' AND addon_id = v_addon_id AND status IN ('active', 'trial', 'past_due');
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid entitlement_type');
  END IF;

  v_period_end := now() + (v_period_months || ' months')::interval;

  INSERT INTO tenant_entitlements (
    tenant_id, entitlement_type, tier_id, addon_id, offer_id, 
    status, current_period_start, current_period_end, auto_renew, source,
    last_payment_id, last_external_reference
  ) VALUES (
    p_tenant_id, p_entitlement_type, v_tier_id, v_addon_id, v_offer_id,
    'active', now(), v_period_end, p_auto_renew, 'mercadopago',
    p_payment_id, p_external_reference
  )
  RETURNING id INTO v_entitlement_id;

  -- NEW: Sync user_access_state for all tenant members
  UPDATE user_access_state 
  SET payment_status = 'active',
      trial_status = 'expired',
      active_subscription_id = v_entitlement_id::text,
      updated_at = now()
  WHERE user_id IN (
    SELECT user_id FROM tenant_members WHERE tenant_id = p_tenant_id
  );

  -- Fallback: if tenant_id is the user_id itself (no tenant_members row)
  UPDATE user_access_state
  SET payment_status = 'active',
      trial_status = 'expired', 
      active_subscription_id = v_entitlement_id::text,
      updated_at = now()
  WHERE user_id = p_tenant_id::uuid
    AND payment_status != 'active';

  -- Log
  INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, metadata)
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

-- Part 3: Update get_user_feature_flags with entitlement fallback
CREATE OR REPLACE FUNCTION public.get_user_feature_flags(p_user_id uuid)
RETURNS jsonb
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
BEGIN
  SELECT * INTO v_state FROM public.user_access_state WHERE user_id = p_user_id;
  
  IF v_state IS NULL THEN
    RETURN jsonb_build_object('error', 'no_state');
  END IF;

  -- Fallback: check tenant_entitlements if payment_status is not active
  IF v_state.payment_status != 'active' THEN
    SELECT EXISTS (
      SELECT 1 FROM tenant_entitlements te
      JOIN tenant_members tm ON tm.tenant_id = te.tenant_id
      WHERE tm.user_id = p_user_id
        AND te.entitlement_type = 'tier'
        AND te.status = 'active'
        AND te.current_period_end > now()
    ) INTO v_has_active_entitlement;

    -- Also check direct tenant_id = user_id (no tenant_members)
    IF NOT v_has_active_entitlement THEN
      SELECT EXISTS (
        SELECT 1 FROM tenant_entitlements te
        WHERE te.tenant_id = p_user_id::text
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
    'has_active_subscription', v_subscription IS NOT NULL OR v_state.payment_status = 'active',
    'billing_complete', v_billing_complete,
    'requires_billing', (v_subscription IS NOT NULL OR v_state.payment_status = 'active') AND NOT v_billing_complete,
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
