
-- Remaining RPCs from the billing system

-- 7) rpc_apply_paid_upgrade
CREATE OR REPLACE FUNCTION public.rpc_apply_paid_upgrade(p_tenant_id uuid, p_quote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote record;
  v_to_plan record;
BEGIN
  SELECT * INTO v_quote FROM upgrade_quotes 
  WHERE id = p_quote_id AND tenant_id = p_tenant_id AND status = 'created';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Cotação não encontrada ou já utilizada');
  END IF;
  IF v_quote.expires_at < now() THEN
    UPDATE upgrade_quotes SET status = 'expired' WHERE id = p_quote_id;
    RETURN jsonb_build_object('error', 'Cotação expirada');
  END IF;
  SELECT * INTO v_to_plan FROM tenant_plans WHERE id = v_quote.to_plan_id;
  UPDATE tenant_subscription SET plan_id = v_quote.to_plan_id, status = 'active', updated_at = now()
  WHERE tenant_id = p_tenant_id;
  UPDATE upgrade_quotes SET status = 'paid', paid_at = now() WHERE id = p_quote_id;
  UPDATE meli_accounts SET status = 'active', status_reason = NULL, updated_at = now()
  WHERE tenant_id = p_tenant_id AND status = 'pending_upgrade';
  PERFORM rpc_compute_sales_30d(p_tenant_id);
  INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, metadata)
  VALUES (p_tenant_id, 'upgrade_applied', 'tenant_subscription', p_tenant_id,
    jsonb_build_object('quote_id', p_quote_id, 'new_plan', v_to_plan.code));
  RETURN jsonb_build_object('success', true, 'new_plan', v_to_plan.code);
END;
$$;

-- 8) rpc_require_billing_after_payment
CREATE OR REPLACE FUNCTION public.rpc_require_billing_after_payment(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_complete bool;
BEGIN
  SELECT is_complete INTO v_complete FROM tenant_billing_profile WHERE tenant_id = p_tenant_id;
  IF v_complete IS NULL OR v_complete = false THEN
    UPDATE tenants SET status = 'blocked_fiscal_missing', updated_at = now() WHERE id = p_tenant_id;
    INSERT INTO audit_logs (tenant_id, action, metadata)
    VALUES (p_tenant_id, 'billing_data_required', jsonb_build_object('is_complete', COALESCE(v_complete, false)));
    RETURN jsonb_build_object('blocked', true, 'reason', 'Dados fiscais incompletos');
  END IF;
  RETURN jsonb_build_object('blocked', false);
END;
$$;

-- 9) rpc_activate_subscription
CREATE OR REPLACE FUNCTION public.rpc_activate_subscription(
  p_tenant_id uuid, 
  p_plan_code text,
  p_mp_subscription_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan record;
  v_now timestamptz := now();
  v_period_end timestamptz := now() + interval '30 days';
BEGIN
  SELECT * INTO v_plan FROM tenant_plans WHERE code = p_plan_code AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Plano não encontrado: ' || p_plan_code);
  END IF;
  INSERT INTO tenant_subscription (tenant_id, plan_id, status, current_period_start, current_period_end, payment_confirmed_at, updated_at)
  VALUES (p_tenant_id, v_plan.id, 'active', v_now, v_period_end, v_now, v_now)
  ON CONFLICT (tenant_id) DO UPDATE SET
    plan_id = v_plan.id, status = 'active', current_period_start = v_now, current_period_end = v_period_end,
    payment_confirmed_at = v_now, updated_at = v_now;
  UPDATE tenants SET status = 'active', updated_at = now() 
  WHERE id = p_tenant_id AND status IN ('blocked_trial_ended', 'blocked_plan_required', 'blocked_payment_issue');
  UPDATE meli_accounts SET status = 'active', status_reason = NULL, updated_at = now()
  WHERE tenant_id = p_tenant_id AND status = 'pending_upgrade';
  PERFORM rpc_require_billing_after_payment(p_tenant_id);
  INSERT INTO audit_logs (tenant_id, action, entity_type, metadata)
  VALUES (p_tenant_id, 'subscription_activated', 'tenant_subscription',
    jsonb_build_object('plan', p_plan_code, 'mp_sub_id', p_mp_subscription_id, 'period_end', v_period_end));
  RETURN jsonb_build_object('success', true, 'plan', p_plan_code, 'period_end', v_period_end);
END;
$$;

-- 10) rpc_check_renewal_cycle
CREATE OR REPLACE FUNCTION public.rpc_check_renewal_cycle(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub record;
  v_sales_result jsonb;
  v_plan record;
  v_is_over bool;
BEGIN
  SELECT * INTO v_sub FROM tenant_subscription WHERE tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('action', 'none', 'reason', 'No subscription');
  END IF;
  IF v_sub.current_period_end > now() THEN
    RETURN jsonb_build_object('action', 'none', 'reason', 'Cycle still active');
  END IF;
  v_sales_result := rpc_compute_sales_30d(p_tenant_id);
  SELECT * INTO v_plan FROM tenant_plans WHERE id = v_sub.plan_id;
  v_is_over := v_plan.max_sales_30d IS NOT NULL AND (v_sales_result->>'sales_30d_total')::int > v_plan.max_sales_30d;
  IF v_is_over THEN
    UPDATE tenants SET status = 'blocked_plan_required', updated_at = now() WHERE id = p_tenant_id;
    UPDATE tenant_subscription SET status = 'blocked', updated_at = now() WHERE tenant_id = p_tenant_id;
    INSERT INTO audit_logs (tenant_id, action, metadata)
    VALUES (p_tenant_id, 'renewal_blocked_over_limit', 
      jsonb_build_object('sales_30d', v_sales_result->>'sales_30d_total', 'plan_max', v_plan.max_sales_30d));
    RETURN jsonb_build_object('action', 'blocked', 'reason', 'Volume excede plano atual');
  END IF;
  UPDATE tenant_subscription SET current_period_start = now(), current_period_end = now() + interval '30 days',
    status = 'active', updated_at = now()
  WHERE tenant_id = p_tenant_id;
  INSERT INTO audit_logs (tenant_id, action, metadata)
  VALUES (p_tenant_id, 'cycle_renewed', jsonb_build_object('plan', v_plan.code));
  RETURN jsonb_build_object('action', 'renewed', 'plan', v_plan.code);
END;
$$;

-- 11) rpc_cancel_subscription
CREATE OR REPLACE FUNCTION public.rpc_cancel_subscription(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub record;
BEGIN
  SELECT * INTO v_sub FROM tenant_subscription WHERE tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Assinatura não encontrada');
  END IF;
  UPDATE tenant_subscription SET status = 'canceled', updated_at = now() WHERE tenant_id = p_tenant_id;
  INSERT INTO audit_logs (tenant_id, action, entity_type, metadata)
  VALUES (p_tenant_id, 'subscription_canceled', 'tenant_subscription',
    jsonb_build_object('period_end', v_sub.current_period_end));
  RETURN jsonb_build_object('success', true, 'access_until', v_sub.current_period_end);
END;
$$;

-- 12) rpc_start_tenant_trial
CREATE OR REPLACE FUNCTION public.rpc_start_tenant_trial(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub record;
  v_eligibility jsonb;
  v_default_plan_id uuid;
BEGIN
  SELECT * INTO v_sub FROM tenant_subscription WHERE tenant_id = p_tenant_id;
  IF FOUND AND v_sub.status NOT IN ('trial') THEN
    RETURN jsonb_build_object('error', 'Tenant já possui assinatura ativa');
  END IF;
  v_eligibility := rpc_compute_trial_eligibility(p_tenant_id);
  IF NOT (v_eligibility->>'trial_eligible')::bool THEN
    RETURN jsonb_build_object('error', v_eligibility->>'reason', 'eligible', false);
  END IF;
  SELECT id INTO v_default_plan_id FROM tenant_plans 
  WHERE is_active = true AND NOT is_enterprise ORDER BY display_order LIMIT 1;
  INSERT INTO tenant_subscription (tenant_id, plan_id, status, trial_start, trial_end, trial_eligible, trial_eligible_reason, current_period_start, current_period_end)
  VALUES (p_tenant_id, v_default_plan_id, 'trial', now(), now() + interval '14 days', true, v_eligibility->>'reason', now(), now() + interval '14 days')
  ON CONFLICT (tenant_id) DO UPDATE SET
    status = 'trial', trial_start = now(), trial_end = now() + interval '14 days',
    trial_eligible = true, current_period_start = now(), current_period_end = now() + interval '14 days', updated_at = now();
  UPDATE tenants SET status = 'active', updated_at = now() WHERE id = p_tenant_id;
  INSERT INTO audit_logs (tenant_id, action, metadata)
  VALUES (p_tenant_id, 'trial_started', jsonb_build_object('days', 14, 'sales_30d', v_eligibility->>'sales_30d_total'));
  RETURN jsonb_build_object('success', true, 'trial_end', now() + interval '14 days');
END;
$$;

-- 13) rpc_on_account_connected
CREATE OR REPLACE FUNCTION public.rpc_on_account_connected(p_tenant_id uuid, p_account_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_is_over bool;
BEGIN
  v_result := rpc_compute_sales_30d(p_tenant_id);
  v_is_over := (v_result->>'is_over_limit')::bool;
  IF v_is_over THEN
    UPDATE meli_accounts SET status = 'pending_upgrade', 
      status_reason = 'Volume excede plano atual. Upgrade necessário.', updated_at = now()
    WHERE id = p_account_id;
    INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, metadata)
    VALUES (p_tenant_id, 'account_pending_upgrade', 'meli_accounts', p_account_id,
      jsonb_build_object('sales_30d', v_result->>'sales_30d_total'));
    RETURN jsonb_build_object('status', 'pending_upgrade', 'message', 'Volume de vendas excede o plano atual. Upgrade necessário.');
  END IF;
  INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, metadata)
  VALUES (p_tenant_id, 'account_connected', 'meli_accounts', p_account_id, v_result);
  RETURN jsonb_build_object('status', 'active', 'message', 'Conta ativada com sucesso');
END;
$$;

-- 14) Trigger: billing profile completeness -> unblock tenant
CREATE OR REPLACE FUNCTION public.trg_billing_profile_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Recalculate is_complete
  IF NEW.person_type = 'pf' THEN
    NEW.is_complete := (NEW.cpf IS NOT NULL AND NEW.full_name IS NOT NULL AND NEW.email IS NOT NULL 
      AND NEW.address_line IS NOT NULL AND NEW.city IS NOT NULL AND NEW.state IS NOT NULL AND NEW.zip_code IS NOT NULL);
  ELSIF NEW.person_type = 'pj' THEN
    NEW.is_complete := (NEW.cnpj IS NOT NULL AND NEW.company_name IS NOT NULL AND NEW.email IS NOT NULL 
      AND NEW.address_line IS NOT NULL AND NEW.city IS NOT NULL AND NEW.state IS NOT NULL AND NEW.zip_code IS NOT NULL);
  ELSE
    NEW.is_complete := false;
  END IF;

  -- If just became complete, unblock tenant
  IF NEW.is_complete AND (OLD.is_complete IS NULL OR NOT OLD.is_complete) THEN
    UPDATE tenants SET status = 'active', updated_at = now()
    WHERE id = NEW.tenant_id AND status = 'blocked_fiscal_missing';
    
    INSERT INTO audit_logs (tenant_id, action, metadata)
    VALUES (NEW.tenant_id, 'billing_data_completed', jsonb_build_object('person_type', NEW.person_type));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_billing_profile_check ON tenant_billing_profile;
CREATE TRIGGER trg_billing_profile_check
  BEFORE INSERT OR UPDATE ON tenant_billing_profile
  FOR EACH ROW
  EXECUTE FUNCTION trg_billing_profile_complete();
