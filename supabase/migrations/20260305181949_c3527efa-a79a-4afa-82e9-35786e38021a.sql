
-- RPC: Activate entitlement from payment
CREATE OR REPLACE FUNCTION public.rpc_activate_entitlement(
  p_tenant_id uuid,
  p_entitlement_type text,  -- 'tier' or 'addon'
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
BEGIN
  IF p_entitlement_type = 'tier' THEN
    -- Resolve tier
    SELECT id INTO v_tier_id FROM plan_tiers WHERE code = p_tier_code AND is_active = true;
    IF v_tier_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Tier not found: ' || p_tier_code);
    END IF;
    -- Resolve offer
    SELECT id, period_months INTO v_offer_id, v_period_months 
    FROM plan_offers WHERE tier_id = v_tier_id AND offer_code = p_offer_code AND is_active = true;
    IF v_offer_id IS NULL THEN
      -- Fallback: 1 month
      v_period_months := 1;
    END IF;
    -- Deactivate existing tier entitlements
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
    -- Deactivate existing addon entitlements of same type
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

-- RPC: Renew entitlement (extend period)
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
  FROM tenant_entitlements e
  LEFT JOIN plan_offers o ON o.id = e.offer_id
  LEFT JOIN plan_addon_offers ao ON ao.id = e.offer_id
  WHERE e.tenant_id = p_tenant_id 
    AND e.entitlement_type = p_entitlement_type 
    AND e.status IN ('active', 'past_due')
  ORDER BY e.created_at DESC LIMIT 1;

  IF v_ent IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active entitlement found');
  END IF;

  v_period_months := v_ent.resolved_period;
  -- Extend from current end or now, whichever is later
  v_new_end := GREATEST(v_ent.current_period_end, now()) + (v_period_months || ' months')::interval;

  UPDATE tenant_entitlements 
  SET status = 'active', current_period_end = v_new_end, 
      last_payment_id = COALESCE(p_payment_id, last_payment_id),
      last_external_reference = COALESCE(p_external_reference, last_external_reference),
      updated_at = now()
  WHERE id = v_ent.id;

  INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, metadata)
  VALUES (p_tenant_id, 'entitlement_renewed', 'tenant_entitlements', v_ent.id,
    jsonb_build_object('period_months', v_period_months, 'new_end', v_new_end, 'payment_id', p_payment_id));

  RETURN jsonb_build_object('success', true, 'new_period_end', v_new_end);
END;
$$;

-- RPC: Check and enforce expired entitlements
CREATE OR REPLACE FUNCTION public.rpc_check_entitlement_expiry(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_expired int := 0;
  v_ent record;
BEGIN
  FOR v_ent IN 
    SELECT id, entitlement_type, auto_renew
    FROM tenant_entitlements
    WHERE tenant_id = p_tenant_id 
      AND status = 'active' 
      AND current_period_end < now()
  LOOP
    IF v_ent.auto_renew THEN
      -- Mark as past_due (waiting for renewal payment)
      UPDATE tenant_entitlements SET status = 'past_due', updated_at = now() WHERE id = v_ent.id;
    ELSE
      -- Non-recurring: block
      UPDATE tenant_entitlements SET status = 'blocked', updated_at = now() WHERE id = v_ent.id;
    END IF;
    v_expired := v_expired + 1;

    INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, metadata)
    VALUES (p_tenant_id, 'entitlement_expired', 'tenant_entitlements', v_ent.id,
      jsonb_build_object('type', v_ent.entitlement_type, 'auto_renew', v_ent.auto_renew));
  END LOOP;

  RETURN jsonb_build_object('expired_count', v_expired);
END;
$$;

-- RPC: Get required tier for tenant volume
CREATE OR REPLACE FUNCTION public.rpc_get_required_tier(p_sales_30d int)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tier record;
BEGIN
  SELECT * INTO v_tier FROM plan_tiers
  WHERE is_active = true 
    AND min_orders_30d <= p_sales_30d
    AND (max_orders_30d IS NULL OR max_orders_30d >= p_sales_30d)
  ORDER BY display_order LIMIT 1;

  IF v_tier IS NULL THEN
    -- Fallback to enterprise
    SELECT * INTO v_tier FROM plan_tiers WHERE is_enterprise = true AND is_active = true LIMIT 1;
  END IF;

  IF v_tier IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  RETURN jsonb_build_object(
    'found', true, 'tier_id', v_tier.id, 'code', v_tier.code, 'name', v_tier.name,
    'is_enterprise', v_tier.is_enterprise, 'min_orders_30d', v_tier.min_orders_30d,
    'max_orders_30d', v_tier.max_orders_30d
  );
END;
$$;
