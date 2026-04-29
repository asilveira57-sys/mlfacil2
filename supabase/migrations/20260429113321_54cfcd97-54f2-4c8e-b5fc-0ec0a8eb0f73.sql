
-- 1) Helper: resolve tenant + offer from a Mercado Pago payment payload
CREATE OR REPLACE FUNCTION public.rpc_resolve_tenant_for_mp(
  p_external_reference text,
  p_payer_email text,
  p_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parts text[];
  v_tier_code text;
  v_offer_code text;
  v_tenant_id uuid;
  v_user_id uuid;
  v_entitlement_type text := 'tier';
  v_addon_code text;
  v_match_source text := 'unknown';
  v_user_id_from_email uuid;
  v_log record;
BEGIN
  IF p_external_reference IS NOT NULL AND position(':' in p_external_reference) > 0 THEN
    v_parts := string_to_array(p_external_reference, ':');
    IF array_length(v_parts, 1) >= 4 THEN
      v_tier_code := v_parts[1];
      v_offer_code := v_parts[2];
      BEGIN
        v_tenant_id := v_parts[3]::uuid;
      EXCEPTION WHEN others THEN v_tenant_id := NULL;
      END;
      BEGIN
        v_user_id := v_parts[4]::uuid;
      EXCEPTION WHEN others THEN v_user_id := NULL;
      END;

      IF v_tier_code LIKE 'addon\_%' ESCAPE '\' THEN
        v_entitlement_type := 'addon';
        v_addon_code := substr(v_tier_code, 7);
        v_tier_code := NULL;
      END IF;

      v_match_source := 'external_reference';
    END IF;
  END IF;

  -- Fallback: try to match a recent successful checkout by payer email and amount
  IF v_tenant_id IS NULL AND p_payer_email IS NOT NULL THEN
    SELECT user_id INTO v_user_id_from_email
    FROM public.profiles
    WHERE lower(email) = lower(p_payer_email)
    LIMIT 1;

    IF v_user_id_from_email IS NOT NULL THEN
      v_user_id := COALESCE(v_user_id, v_user_id_from_email);

      SELECT t.id INTO v_tenant_id
      FROM public.tenants t
      WHERE t.owner_user_id = v_user_id_from_email
      ORDER BY t.created_at DESC
      LIMIT 1;

      v_match_source := COALESCE(NULLIF(v_match_source,'unknown'), 'payer_email');
    END IF;
  END IF;

  -- Fallback: pull most recent checkout for this user/tenant when offer info missing
  IF v_offer_code IS NULL OR v_tier_code IS NULL THEN
    SELECT meta_json->>'entity_code' as tier_code,
           meta_json->>'offer_code' as offer_code,
           meta_json->>'entitlement_type' as ent_type
      INTO v_log
    FROM public.system_logs
    WHERE system_area = 'billing'
      AND action = 'checkout_created'
      AND (v_user_id IS NULL OR user_id = v_user_id)
      AND (
        p_external_reference IS NULL
        OR meta_json->>'external_reference' = p_external_reference
      )
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_log.tier_code IS NOT NULL THEN
      IF v_tier_code IS NULL THEN
        IF v_log.tier_code LIKE 'addon\_%' ESCAPE '\' THEN
          v_entitlement_type := 'addon';
          v_addon_code := substr(v_log.tier_code, 7);
        ELSE
          v_tier_code := v_log.tier_code;
        END IF;
      END IF;
      IF v_offer_code IS NULL THEN
        v_offer_code := v_log.offer_code;
      END IF;
      IF v_entitlement_type IS NULL OR v_entitlement_type = 'tier' THEN
        v_entitlement_type := COALESCE(v_log.ent_type, v_entitlement_type);
      END IF;
      IF v_match_source = 'unknown' THEN
        v_match_source := 'checkout_log';
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'tenant_id', v_tenant_id,
    'user_id', v_user_id,
    'entitlement_type', v_entitlement_type,
    'tier_code', v_tier_code,
    'addon_code', v_addon_code,
    'offer_code', v_offer_code,
    'match_source', v_match_source
  );
END;
$$;

-- 2) Idempotent processor for Mercado Pago payment events
CREATE OR REPLACE FUNCTION public.rpc_process_mp_payment(
  p_payment_id text,
  p_external_reference text,
  p_amount_brl numeric,
  p_currency text,
  p_status text,
  p_status_detail text,
  p_payer_email text,
  p_paid_at timestamptz,
  p_raw jsonb,
  p_auto_renew boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resolved jsonb;
  v_tenant_id uuid;
  v_entitlement_type text;
  v_tier_code text;
  v_addon_code text;
  v_offer_code text;
  v_existing_status text;
  v_payment_row_id uuid;
  v_existing_ent uuid;
  v_action_result jsonb;
  v_action text;
BEGIN
  IF p_payment_id IS NULL OR length(p_payment_id) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_payment_id');
  END IF;

  -- Resolve tenant/offer
  v_resolved := public.rpc_resolve_tenant_for_mp(p_external_reference, p_payer_email, p_amount_brl);

  v_tenant_id := NULLIF(v_resolved->>'tenant_id','')::uuid;
  v_entitlement_type := COALESCE(v_resolved->>'entitlement_type','tier');
  v_tier_code := NULLIF(v_resolved->>'tier_code','');
  v_addon_code := NULLIF(v_resolved->>'addon_code','');
  v_offer_code := NULLIF(v_resolved->>'offer_code','');

  IF v_tenant_id IS NULL THEN
    -- Still record the payment for visibility, no entitlement change
    INSERT INTO public.tenant_payments (
      tenant_id, provider, payment_id, external_reference,
      amount_brl, currency, status, paid_at, raw
    ) VALUES (
      '00000000-0000-0000-0000-000000000000'::uuid,
      'mercadopago', p_payment_id, p_external_reference,
      COALESCE(p_amount_brl, 0), COALESCE(p_currency,'BRL'),
      COALESCE(p_status,'unknown'),
      CASE WHEN p_status='approved' THEN COALESCE(p_paid_at, now()) ELSE NULL END,
      jsonb_build_object('payment', p_raw, 'status_detail', p_status_detail, 'unresolved', true)
    )
    ON CONFLICT (provider, payment_id) DO UPDATE SET
      status = EXCLUDED.status,
      amount_brl = EXCLUDED.amount_brl,
      external_reference = EXCLUDED.external_reference,
      paid_at = EXCLUDED.paid_at,
      raw = EXCLUDED.raw;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'tenant_not_resolved',
      'resolved', v_resolved,
      'payment_recorded', true
    );
  END IF;

  -- Upsert payment record (idempotent on provider+payment_id)
  INSERT INTO public.tenant_payments (
    tenant_id, provider, payment_id, external_reference,
    amount_brl, currency, status, paid_at, raw
  ) VALUES (
    v_tenant_id, 'mercadopago', p_payment_id, p_external_reference,
    COALESCE(p_amount_brl, 0), COALESCE(p_currency,'BRL'),
    COALESCE(p_status,'unknown'),
    CASE WHEN p_status='approved' THEN COALESCE(p_paid_at, now()) ELSE NULL END,
    jsonb_build_object('payment', p_raw, 'status_detail', p_status_detail, 'resolved', v_resolved)
  )
  ON CONFLICT (provider, payment_id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    status = EXCLUDED.status,
    amount_brl = EXCLUDED.amount_brl,
    external_reference = COALESCE(EXCLUDED.external_reference, public.tenant_payments.external_reference),
    paid_at = COALESCE(EXCLUDED.paid_at, public.tenant_payments.paid_at),
    raw = EXCLUDED.raw
  RETURNING id, status INTO v_payment_row_id, v_existing_status;

  IF p_status <> 'approved' THEN
    RETURN jsonb_build_object(
      'success', true,
      'payment_id', v_payment_row_id,
      'tenant_id', v_tenant_id,
      'status', p_status,
      'entitlement_action', 'none'
    );
  END IF;

  -- Approved: ensure no double provisioning for this payment
  SELECT id INTO v_existing_ent
  FROM public.tenant_entitlements
  WHERE tenant_id = v_tenant_id
    AND last_payment_id = p_payment_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_ent IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'payment_id', v_payment_row_id,
      'tenant_id', v_tenant_id,
      'entitlement_id', v_existing_ent,
      'entitlement_action', 'skipped_duplicate'
    );
  END IF;

  -- Decide activate vs renew
  SELECT id INTO v_existing_ent
  FROM public.tenant_entitlements
  WHERE tenant_id = v_tenant_id
    AND entitlement_type = v_entitlement_type
    AND status IN ('active','past_due')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_ent IS NOT NULL THEN
    v_action := 'renew';
    v_action_result := public.rpc_renew_entitlement(
      p_tenant_id := v_tenant_id,
      p_entitlement_type := v_entitlement_type,
      p_payment_id := p_payment_id,
      p_external_reference := p_external_reference
    );
  ELSE
    v_action := 'activate';
    v_action_result := public.rpc_activate_entitlement(
      p_tenant_id := v_tenant_id,
      p_entitlement_type := v_entitlement_type,
      p_tier_code := v_tier_code,
      p_addon_code := v_addon_code,
      p_offer_code := v_offer_code,
      p_payment_id := p_payment_id,
      p_external_reference := p_external_reference,
      p_auto_renew := p_auto_renew
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment_row_id,
    'tenant_id', v_tenant_id,
    'entitlement_action', v_action,
    'entitlement_result', v_action_result,
    'resolved', v_resolved
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_process_mp_payment(text,text,numeric,text,text,text,text,timestamptz,jsonb,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_resolve_tenant_for_mp(text,text,numeric) TO service_role;
