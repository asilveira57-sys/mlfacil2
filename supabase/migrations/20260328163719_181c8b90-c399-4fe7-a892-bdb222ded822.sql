-- =============================================================
-- Fix get_user_feature_flags type mismatch + backfill + test account
-- =============================================================
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
    'can_print_labels', v_state.onboarding_status = 'completed',
    'can_import_sales', v_state.onboarding_status = 'completed' AND v_state.ml_account_connected,
    'can_access_reports', v_state.onboarding_status = 'completed',
    'can_manage_integrations', v_state.onboarding_status = 'completed',
    'trial_warnings', '[]'::jsonb,
    'computed_at', now(),
    'state_version', 3
  );

  RETURN v_flags;
END;
$$;

-- Backfill user_access_state for users with active entitlements
UPDATE user_access_state uas
SET payment_status = 'active',
    trial_status = 'expired',
    updated_at = now()
WHERE uas.payment_status != 'active'
  AND EXISTS (
    SELECT 1 FROM tenant_entitlements te
    JOIN tenant_members tm ON tm.tenant_id = te.tenant_id
    WHERE tm.user_id = uas.user_id
      AND te.entitlement_type = 'tier'
      AND te.status = 'active'
      AND te.current_period_end > now()
  );

-- Grant 1000-day entitlement to test account
INSERT INTO tenant_entitlements (
  tenant_id, entitlement_type, tier_id, status,
  current_period_start, current_period_end, auto_renew, source,
  last_payment_id, last_external_reference
) VALUES (
  'a1000001-0000-0000-0000-000000000001',
  'tier',
  '26cf9f33-4e95-400b-a335-9b4d4b70f58a',
  'active',
  now(),
  now() + interval '1000 days',
  false,
  'admin_manual_grant',
  'ADMIN-GRANT-TEST-1000D',
  'manual_test_account_grant'
) ON CONFLICT DO NOTHING;

-- Sync user_access_state for test account
UPDATE user_access_state
SET payment_status = 'active',
    trial_status = 'expired',
    updated_at = now()
WHERE user_id = '433a4292-92c0-4ced-9c29-f1199f990d9a';

-- Audit log
INSERT INTO system_audit_log (
  user_id, event_type, event_category, target_id, details
) VALUES (
  '433a4292-92c0-4ced-9c29-f1199f990d9a',
  'admin_manual_entitlement_grant',
  'billing',
  'a1000001-0000-0000-0000-000000000001',
  jsonb_build_object(
    'reason', 'Test account - 1000 day grant for development',
    'tier', 'Até 50 pedidos/mês',
    'duration_days', 1000
  )
);