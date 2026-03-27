
-- Fix rpc_activate_entitlement: don't set active_subscription_id (FK to subscriptions)
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

  -- Sync user_access_state for all tenant members
  UPDATE user_access_state 
  SET payment_status = 'active',
      trial_status = 'expired',
      updated_at = now()
  WHERE user_id IN (
    SELECT user_id FROM tenant_members WHERE tenant_id = p_tenant_id
  );

  -- Fallback: if tenant_id is the user_id itself
  UPDATE user_access_state
  SET payment_status = 'active',
      trial_status = 'expired', 
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
