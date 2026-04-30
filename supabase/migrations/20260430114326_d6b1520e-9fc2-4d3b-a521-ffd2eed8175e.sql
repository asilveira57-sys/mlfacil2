-- Ensure Mercado Pago payment processing renews only the exact same entitlement/offer.
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
  v_payment_row_id uuid;
  v_existing_ent uuid;
  v_action_result jsonb;
  v_action text;
  v_target_tier_id uuid;
  v_target_addon_id uuid;
  v_target_offer_id uuid;
BEGIN
  IF p_payment_id IS NULL OR length(p_payment_id) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_payment_id');
  END IF;

  v_resolved := public.rpc_resolve_tenant_for_mp(p_external_reference, p_payer_email, p_amount_brl);

  v_tenant_id := NULLIF(v_resolved->>'tenant_id','')::uuid;
  v_entitlement_type := COALESCE(v_resolved->>'entitlement_type','tier');
  v_tier_code := NULLIF(v_resolved->>'tier_code','');
  v_addon_code := NULLIF(v_resolved->>'addon_code','');
  v_offer_code := NULLIF(v_resolved->>'offer_code','');

  IF v_entitlement_type = 'tier' AND v_tier_code IS NOT NULL THEN
    SELECT id INTO v_target_tier_id
    FROM public.plan_tiers
    WHERE code = v_tier_code AND is_active = true
    LIMIT 1;

    IF v_target_tier_id IS NOT NULL AND v_offer_code IS NOT NULL THEN
      SELECT id INTO v_target_offer_id
      FROM public.plan_offers
      WHERE tier_id = v_target_tier_id AND offer_code = v_offer_code AND is_active = true
      LIMIT 1;
    END IF;
  ELSIF v_entitlement_type = 'addon' AND v_addon_code IS NOT NULL THEN
    SELECT id INTO v_target_addon_id
    FROM public.plan_addons
    WHERE code = v_addon_code AND is_active = true
    LIMIT 1;

    IF v_target_addon_id IS NOT NULL AND v_offer_code IS NOT NULL THEN
      SELECT id INTO v_target_offer_id
      FROM public.plan_addon_offers
      WHERE addon_id = v_target_addon_id AND offer_code = v_offer_code AND is_active = true
      LIMIT 1;
    END IF;
  END IF;

  IF v_tenant_id IS NULL THEN
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
      raw = EXCLUDED.raw
    RETURNING id INTO v_payment_row_id;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'tenant_not_resolved',
      'resolved', v_resolved,
      'payment_recorded', true,
      'payment_id', v_payment_row_id
    );
  END IF;

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
  RETURNING id INTO v_payment_row_id;

  IF p_status <> 'approved' THEN
    RETURN jsonb_build_object(
      'success', true,
      'payment_id', v_payment_row_id,
      'tenant_id', v_tenant_id,
      'status', p_status,
      'entitlement_action', 'none'
    );
  END IF;

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
      'entitlement_action', 'skipped_duplicate',
      'resolved', v_resolved
    );
  END IF;

  SELECT id INTO v_existing_ent
  FROM public.tenant_entitlements e
  WHERE e.tenant_id = v_tenant_id
    AND e.entitlement_type = v_entitlement_type
    AND e.status IN ('active','past_due')
    AND (
      (v_entitlement_type = 'tier'
        AND v_target_tier_id IS NOT NULL
        AND e.tier_id = v_target_tier_id
        AND (v_target_offer_id IS NULL OR e.offer_id = v_target_offer_id))
      OR
      (v_entitlement_type = 'addon'
        AND v_target_addon_id IS NOT NULL
        AND e.addon_id = v_target_addon_id
        AND (v_target_offer_id IS NULL OR e.offer_id = v_target_offer_id))
      OR
      (v_target_tier_id IS NULL AND v_target_addon_id IS NULL AND v_target_offer_id IS NULL)
    )
  ORDER BY e.current_period_end DESC NULLS LAST, e.created_at DESC
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

-- Keep automatic reconciliation running so approved payments are captured even if webhook delivery is delayed/missed.
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid
  FROM cron.job
  WHERE jobname = 'billing-reconcile-payments-5min'
  LIMIT 1;

  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END $$;

SELECT cron.schedule(
  'billing-reconcile-payments-5min',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/billing-reconcile-payments',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'email_queue_service_role_key'
      )
    ),
    body := '{"since_days":2,"source":"cron"}'::jsonb
  ) AS request_id;
  $cron$
);

-- Repair animaisworld payment order: ZPL first, then Veterano trimestral as the active entitlement.
WITH zpl_payment AS (
  SELECT *
  FROM public.tenant_payments
  WHERE provider = 'mercadopago'
    AND payment_id = '157058448950'
    AND tenant_id = '78e5ef89-572e-4c51-a4a8-2f6b9598b137'
  LIMIT 1
), zpl_target AS (
  SELECT pt.id AS tier_id, po.id AS offer_id, po.period_months
  FROM public.plan_tiers pt
  JOIN public.plan_offers po ON po.tier_id = pt.id
  WHERE pt.code = 'zpl-basico'
    AND po.offer_code = 'rec_1m'
  LIMIT 1
)
INSERT INTO public.tenant_entitlements (
  tenant_id,
  entitlement_type,
  tier_id,
  addon_id,
  offer_id,
  status,
  current_period_start,
  current_period_end,
  auto_renew,
  source,
  last_payment_id,
  last_external_reference
)
SELECT
  '78e5ef89-572e-4c51-a4a8-2f6b9598b137'::uuid,
  'tier',
  zpl_target.tier_id,
  NULL,
  zpl_target.offer_id,
  'canceled',
  COALESCE(zpl_payment.paid_at, zpl_payment.created_at, now()),
  COALESCE(zpl_payment.paid_at, zpl_payment.created_at, now()) + (zpl_target.period_months || ' months')::interval,
  true,
  'mercadopago',
  '157058448950',
  'zpl-basico:rec_1m:78e5ef89-572e-4c51-a4a8-2f6b9598b137:e7bc87df-57df-47b1-b7d8-4530b130ab18'
FROM zpl_payment, zpl_target
WHERE NOT EXISTS (
  SELECT 1 FROM public.tenant_entitlements
  WHERE tenant_id = '78e5ef89-572e-4c51-a4a8-2f6b9598b137'
    AND last_payment_id = '157058448950'
);

WITH vet_payment AS (
  SELECT *
  FROM public.tenant_payments
  WHERE provider = 'mercadopago'
    AND payment_id = '157059486168'
    AND tenant_id = '78e5ef89-572e-4c51-a4a8-2f6b9598b137'
  LIMIT 1
), vet_target AS (
  SELECT pt.id AS tier_id, po.id AS offer_id, po.period_months
  FROM public.plan_tiers pt
  JOIN public.plan_offers po ON po.tier_id = pt.id
  WHERE pt.code = 'veterano'
    AND po.offer_code = 'veterano-trimestral'
  LIMIT 1
), active_ent AS (
  SELECT id
  FROM public.tenant_entitlements
  WHERE tenant_id = '78e5ef89-572e-4c51-a4a8-2f6b9598b137'
    AND entitlement_type = 'tier'
    AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1
)
UPDATE public.tenant_entitlements te
SET entitlement_type = 'tier',
    tier_id = vet_target.tier_id,
    addon_id = NULL,
    offer_id = vet_target.offer_id,
    status = 'active',
    current_period_start = COALESCE(vet_payment.paid_at, vet_payment.created_at, now()),
    current_period_end = COALESCE(vet_payment.paid_at, vet_payment.created_at, now()) + (vet_target.period_months || ' months')::interval,
    auto_renew = true,
    source = 'mercadopago',
    last_payment_id = '157059486168',
    last_external_reference = 'veterano:veterano-trimestral:78e5ef89-572e-4c51-a4a8-2f6b9598b137:e7bc87df-57df-47b1-b7d8-4530b130ab18',
    updated_at = now()
FROM vet_payment, vet_target, active_ent
WHERE te.id = active_ent.id;

UPDATE public.user_access_state
SET payment_status = 'active',
    trial_status = 'expired',
    updated_at = now()
WHERE user_id = 'e7bc87df-57df-47b1-b7d8-4530b130ab18';