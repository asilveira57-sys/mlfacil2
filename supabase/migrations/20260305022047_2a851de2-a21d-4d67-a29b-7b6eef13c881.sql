
-- Drop old tables with incompatible schemas
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.sync_jobs CASCADE;

-- ============================================================
-- MARKETPLACE FÁCIL — FUNDAÇÃO TENANT-BASED (CLEAN)
-- ============================================================

-- A1) tenants
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','blocked_trial_ended','blocked_fiscal_missing','blocked_plan_required','blocked_payment_issue')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tenants_owner ON public.tenants(owner_user_id);
CREATE INDEX idx_tenants_status ON public.tenants(status);

-- A2) tenant_members
CREATE TABLE public.tenant_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'viewer'
    CHECK (role IN ('owner','admin','operator','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);

-- A3) tenant_plans
CREATE TABLE public.tenant_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  min_sales_30d int NOT NULL DEFAULT 0,
  max_sales_30d int,
  monthly_price_cents int NOT NULL DEFAULT 0,
  is_active bool NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- A4) tenant_subscription
CREATE TABLE public.tenant_subscription (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE,
  plan_id uuid NOT NULL REFERENCES public.tenant_plans(id),
  status text NOT NULL DEFAULT 'trial'
    CHECK (status IN ('trial','active','past_due','canceled','blocked')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_start timestamptz,
  trial_end timestamptz,
  trial_eligible bool NOT NULL DEFAULT false,
  trial_eligible_reason text,
  payment_confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tenant_sub_tenant ON public.tenant_subscription(tenant_id);
CREATE INDEX idx_tenant_sub_status ON public.tenant_subscription(status);
CREATE INDEX idx_tenant_sub_period_end ON public.tenant_subscription(current_period_end);

-- A5) tenant_billing_profile
CREATE TABLE public.tenant_billing_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE,
  person_type text CHECK (person_type IN ('pf','pj')),
  cpf text, cnpj text, full_name text, company_name text, trade_name text,
  email text, phone text, address_line text, address_number text,
  address_complement text, neighborhood text, city text, state text, zip_code text,
  is_complete bool NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A6) meli_accounts
CREATE TABLE public.meli_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nickname text NOT NULL,
  meli_user_id text NOT NULL,
  country text NOT NULL DEFAULT 'MLB',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','pending_upgrade','disabled','error')),
  status_reason text,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_meli_accounts_tenant ON public.meli_accounts(tenant_id);
CREATE INDEX idx_meli_accounts_tenant_status ON public.meli_accounts(tenant_id, status);
CREATE INDEX idx_meli_accounts_meli_user ON public.meli_accounts(meli_user_id);

-- A7) tenant_usage_snapshot
CREATE TABLE public.tenant_usage_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  sales_30d_total int NOT NULL DEFAULT 0,
  sales_30d_by_account jsonb NOT NULL DEFAULT '{}',
  computed_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'auto',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_usage_snap_tenant ON public.tenant_usage_snapshot(tenant_id, computed_at DESC);

-- A8) tenant_limits_state
CREATE TABLE public.tenant_limits_state (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  is_over_limit bool NOT NULL DEFAULT false,
  over_limit_detected_at timestamptz,
  required_plan_id uuid REFERENCES public.tenant_plans(id),
  blocked_actions jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A9) upgrade_quotes
CREATE TABLE public.upgrade_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  from_plan_id uuid NOT NULL REFERENCES public.tenant_plans(id),
  to_plan_id uuid NOT NULL REFERENCES public.tenant_plans(id),
  currency text NOT NULL DEFAULT 'BRL',
  diff_monthly_cents int NOT NULL,
  remaining_seconds_in_cycle bigint NOT NULL,
  cycle_total_seconds bigint NOT NULL,
  proration_factor numeric NOT NULL,
  amount_due_cents int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created','paid','expired','canceled')),
  paid_at timestamptz
);
CREATE INDEX idx_upgrade_quotes_tenant ON public.upgrade_quotes(tenant_id, created_at DESC);
CREATE INDEX idx_upgrade_quotes_status ON public.upgrade_quotes(status);

-- A10) sync_jobs
CREATE TABLE public.sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  module text NOT NULL,
  scope text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','success','failed','canceled')),
  started_at timestamptz,
  finished_at timestamptz,
  created_by_user_id uuid REFERENCES auth.users(id),
  metadata jsonb NOT NULL DEFAULT '{}',
  locked_after_success bool NOT NULL DEFAULT false,
  lock_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sync_jobs_tenant_module ON public.sync_jobs(tenant_id, module, scope, created_at DESC);
CREATE INDEX idx_sync_jobs_tenant_status ON public.sync_jobs(tenant_id, status);

-- A11) audit_logs
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_tenant ON public.audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);

-- ============================================================
-- SECURITY DEFINER helper
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_tenant_member(_user_id uuid, _tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.tenant_members WHERE user_id = _user_id AND tenant_id = _tenant_id)
  OR EXISTS (SELECT 1 FROM public.tenants WHERE id = _tenant_id AND owner_user_id = _user_id);
$$;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_select" ON public.tenants FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), id));
CREATE POLICY "tenant_update" ON public.tenants FOR UPDATE TO authenticated USING (public.is_tenant_member(auth.uid(), id));
CREATE POLICY "tenant_insert" ON public.tenants FOR INSERT TO authenticated WITH CHECK (owner_user_id = auth.uid());

ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tm_select" ON public.tenant_members FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "tm_insert" ON public.tenant_members FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "tm_delete" ON public.tenant_members FOR DELETE TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));

ALTER TABLE public.tenant_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans_select" ON public.tenant_plans FOR SELECT TO authenticated USING (true);

ALTER TABLE public.tenant_subscription ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sub_select" ON public.tenant_subscription FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "sub_update" ON public.tenant_subscription FOR UPDATE TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));

ALTER TABLE public.tenant_billing_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY "billing_select" ON public.tenant_billing_profile FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "billing_upsert" ON public.tenant_billing_profile FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "billing_update" ON public.tenant_billing_profile FOR UPDATE TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));

ALTER TABLE public.meli_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meli_select" ON public.meli_accounts FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "meli_insert" ON public.meli_accounts FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "meli_update" ON public.meli_accounts FOR UPDATE TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));

ALTER TABLE public.tenant_usage_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usage_select" ON public.tenant_usage_snapshot FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));

ALTER TABLE public.tenant_limits_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "limits_select" ON public.tenant_limits_state FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));

ALTER TABLE public.upgrade_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quotes_select" ON public.upgrade_quotes FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));

ALTER TABLE public.sync_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "syncjobs_select" ON public.sync_jobs FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "syncjobs_insert" ON public.sync_jobs FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auditlogs_select" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));

-- ============================================================
-- RPCs
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_get_required_plan(p_sales_30d_total int)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.tenant_plans
  WHERE is_active = true AND min_sales_30d <= p_sales_30d_total
    AND (max_sales_30d IS NULL OR max_sales_30d >= p_sales_30d_total)
  ORDER BY min_sales_30d ASC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.rpc_compute_trial_eligibility(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total_sales int := 0; v_eligible bool := false; v_reason text := '';
BEGIN
  SELECT count(*) INTO v_total_sales FROM public.meli_accounts WHERE tenant_id = p_tenant_id AND status = 'active';
  IF v_total_sales > 10 THEN
    v_eligible := true; v_reason := 'Elegível: mais de 10 vendas com atividade recente';
  ELSE
    v_reason := 'Menos de 10 vendas totais';
  END IF;

  UPDATE public.tenant_subscription SET trial_eligible = v_eligible, trial_eligible_reason = v_reason, updated_at = now() WHERE tenant_id = p_tenant_id;
  INSERT INTO public.audit_logs (tenant_id, action, entity_type, entity_id, metadata)
  VALUES (p_tenant_id, 'compute_trial_eligibility', 'tenant', p_tenant_id,
    jsonb_build_object('eligible', v_eligible, 'reason', v_reason, 'sales_total', v_total_sales));

  RETURN jsonb_build_object('trial_eligible', v_eligible, 'reason', v_reason, 'sales_30d_total', v_total_sales);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_compute_sales_30d(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total int := 0; v_by_account jsonb := '{}'; v_required_plan uuid;
  v_is_over bool := false; v_current_plan_id uuid; v_current_max int;
BEGIN
  INSERT INTO public.tenant_usage_snapshot (tenant_id, period_start, period_end, sales_30d_total, sales_30d_by_account, source)
  VALUES (p_tenant_id, (now() - interval '30 days')::date, now()::date, v_total, v_by_account, 'auto');

  v_required_plan := public.rpc_get_required_plan(v_total);
  SELECT ts.plan_id INTO v_current_plan_id FROM public.tenant_subscription ts WHERE ts.tenant_id = p_tenant_id;
  IF v_current_plan_id IS NOT NULL THEN
    SELECT tp.max_sales_30d INTO v_current_max FROM public.tenant_plans tp WHERE tp.id = v_current_plan_id;
    IF v_current_max IS NOT NULL AND v_total > v_current_max THEN v_is_over := true; END IF;
  END IF;

  INSERT INTO public.tenant_limits_state (tenant_id, is_over_limit, over_limit_detected_at, required_plan_id, blocked_actions, updated_at)
  VALUES (p_tenant_id, v_is_over, CASE WHEN v_is_over THEN now() ELSE NULL END, v_required_plan,
    CASE WHEN v_is_over THEN '{"add_account":true,"sync_12m":true,"heavy_modules":true}'::jsonb ELSE '{}'::jsonb END, now())
  ON CONFLICT (tenant_id) DO UPDATE SET
    is_over_limit = EXCLUDED.is_over_limit,
    over_limit_detected_at = CASE WHEN EXCLUDED.is_over_limit THEN COALESCE(tenant_limits_state.over_limit_detected_at, now()) ELSE NULL END,
    required_plan_id = EXCLUDED.required_plan_id, blocked_actions = EXCLUDED.blocked_actions, updated_at = now();

  INSERT INTO public.audit_logs (tenant_id, action, entity_type, entity_id, metadata)
  VALUES (p_tenant_id, 'compute_sales_30d', 'tenant', p_tenant_id,
    jsonb_build_object('total', v_total, 'is_over', v_is_over, 'required_plan', v_required_plan));

  RETURN jsonb_build_object('sales_30d_total', v_total, 'sales_30d_by_account', v_by_account, 'required_plan_id', v_required_plan, 'is_over_limit', v_is_over);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_create_upgrade_quote(p_tenant_id uuid, p_to_plan_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sub record; v_from_price int; v_to_price int; v_diff int;
  v_remaining bigint; v_total bigint; v_factor numeric; v_amount int; v_quote_id uuid;
BEGIN
  SELECT * INTO v_sub FROM public.tenant_subscription WHERE tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assinatura não encontrada'; END IF;
  SELECT monthly_price_cents INTO v_from_price FROM public.tenant_plans WHERE id = v_sub.plan_id;
  SELECT monthly_price_cents INTO v_to_price FROM public.tenant_plans WHERE id = p_to_plan_id;
  IF v_to_price IS NULL THEN RAISE EXCEPTION 'Plano destino não encontrado'; END IF;
  IF v_to_price <= v_from_price THEN RAISE EXCEPTION 'Plano destino deve ser superior ao atual'; END IF;
  v_diff := v_to_price - v_from_price;

  IF v_sub.current_period_end IS NOT NULL AND v_sub.current_period_start IS NOT NULL THEN
    v_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_sub.current_period_end - now()))::bigint);
    v_total := GREATEST(1, EXTRACT(EPOCH FROM (v_sub.current_period_end - v_sub.current_period_start))::bigint);
  ELSE v_remaining := 2592000; v_total := 2592000; END IF;

  v_factor := v_remaining::numeric / v_total::numeric;
  v_amount := CEIL(v_diff * v_factor);

  INSERT INTO public.upgrade_quotes (tenant_id, from_plan_id, to_plan_id, diff_monthly_cents, remaining_seconds_in_cycle, cycle_total_seconds, proration_factor, amount_due_cents, expires_at)
  VALUES (p_tenant_id, v_sub.plan_id, p_to_plan_id, v_diff, v_remaining, v_total, v_factor, v_amount, now() + interval '2 hours')
  RETURNING id INTO v_quote_id;

  INSERT INTO public.audit_logs (tenant_id, action, entity_type, entity_id, metadata)
  VALUES (p_tenant_id, 'create_upgrade_quote', 'upgrade_quote', v_quote_id,
    jsonb_build_object('from_plan', v_sub.plan_id, 'to_plan', p_to_plan_id, 'amount_cents', v_amount, 'factor', v_factor));

  RETURN jsonb_build_object('quote_id', v_quote_id, 'from_plan_id', v_sub.plan_id, 'to_plan_id', p_to_plan_id,
    'diff_monthly_cents', v_diff, 'proration_factor', v_factor, 'amount_due_cents', v_amount, 'expires_at', (now() + interval '2 hours'));
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_apply_paid_upgrade(p_tenant_id uuid, p_quote_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_quote record;
BEGIN
  SELECT * INTO v_quote FROM public.upgrade_quotes WHERE id = p_quote_id AND tenant_id = p_tenant_id AND status = 'created';
  IF NOT FOUND THEN RAISE EXCEPTION 'Cotação não encontrada ou já utilizada'; END IF;
  IF v_quote.expires_at < now() THEN
    UPDATE public.upgrade_quotes SET status = 'expired' WHERE id = p_quote_id;
    RAISE EXCEPTION 'Cotação expirada';
  END IF;

  UPDATE public.tenant_subscription SET plan_id = v_quote.to_plan_id, status = 'active', updated_at = now() WHERE tenant_id = p_tenant_id;
  UPDATE public.upgrade_quotes SET status = 'paid', paid_at = now() WHERE id = p_quote_id;
  PERFORM public.rpc_compute_sales_30d(p_tenant_id);

  UPDATE public.meli_accounts SET status = 'active', status_reason = NULL, updated_at = now()
  WHERE tenant_id = p_tenant_id AND status = 'pending_upgrade'
    AND NOT EXISTS (SELECT 1 FROM public.tenant_limits_state tls WHERE tls.tenant_id = p_tenant_id AND tls.is_over_limit = true);

  INSERT INTO public.audit_logs (tenant_id, action, entity_type, entity_id, metadata)
  VALUES (p_tenant_id, 'apply_paid_upgrade', 'upgrade_quote', p_quote_id,
    jsonb_build_object('to_plan', v_quote.to_plan_id, 'amount_cents', v_quote.amount_due_cents));

  RETURN jsonb_build_object('success', true, 'new_plan_id', v_quote.to_plan_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_require_billing_after_payment(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_complete bool;
BEGIN
  SELECT is_complete INTO v_complete FROM public.tenant_billing_profile WHERE tenant_id = p_tenant_id;
  IF v_complete IS NOT TRUE THEN
    UPDATE public.tenants SET status = 'blocked_fiscal_missing', updated_at = now() WHERE id = p_tenant_id;
    INSERT INTO public.audit_logs (tenant_id, action, metadata)
    VALUES (p_tenant_id, 'require_billing_blocked', jsonb_build_object('reason', 'billing_profile_incomplete'));
    RETURN jsonb_build_object('blocked', true, 'reason', 'billing_profile_incomplete');
  END IF;
  RETURN jsonb_build_object('blocked', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_create_sync_job(p_tenant_id uuid, p_module text, p_scope text, p_metadata jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_running bool; v_locked record; v_job_id uuid;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.sync_jobs WHERE tenant_id = p_tenant_id AND module = p_module AND scope = p_scope AND status = 'running') INTO v_running;
  IF v_running THEN
    RETURN jsonb_build_object('success', false, 'error', 'job_already_running', 'message', 'Já existe uma execução em andamento para este módulo/escopo.');
  END IF;

  SELECT locked_after_success, lock_reason INTO v_locked FROM public.sync_jobs
  WHERE tenant_id = p_tenant_id AND module = p_module AND scope = p_scope AND locked_after_success = true
  ORDER BY created_at DESC LIMIT 1;
  IF FOUND AND v_locked.locked_after_success THEN
    RETURN jsonb_build_object('success', false, 'error', 'job_locked',
      'message', COALESCE(v_locked.lock_reason, 'Job travado após sucesso. Contate o suporte.'));
  END IF;

  IF p_scope = 'last_12m' THEN
    IF NOT EXISTS (SELECT 1 FROM public.tenant_subscription WHERE tenant_id = p_tenant_id AND status = 'active' AND payment_confirmed_at IS NOT NULL) THEN
      RETURN jsonb_build_object('success', false, 'error', 'subscription_required', 'message', 'Importação de 12 meses disponível apenas após ativação do plano.');
    END IF;
  END IF;

  INSERT INTO public.sync_jobs (tenant_id, module, scope, status, created_by_user_id, metadata)
  VALUES (p_tenant_id, p_module, p_scope, 'queued', auth.uid(), p_metadata)
  RETURNING id INTO v_job_id;

  INSERT INTO public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (p_tenant_id, auth.uid(), 'create_sync_job', 'sync_job', v_job_id, jsonb_build_object('module', p_module, 'scope', p_scope));

  RETURN jsonb_build_object('success', true, 'job_id', v_job_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_mark_sync_job_status(p_job_id uuid, p_status text, p_metadata_patch jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_job record; v_should_lock bool := false; v_lock_reason text;
BEGIN
  SELECT * INTO v_job FROM public.sync_jobs WHERE id = p_job_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job não encontrado'; END IF;

  IF p_status = 'running' THEN
    UPDATE public.sync_jobs SET status = p_status, started_at = now(), metadata = metadata || p_metadata_patch WHERE id = p_job_id;
  ELSIF p_status IN ('success','failed','canceled') THEN
    IF p_status = 'success' AND v_job.module = 'costs_orders_import' AND v_job.scope = 'last_12m' THEN
      v_should_lock := true;
      v_lock_reason := 'Importação de 12 meses concluída com sucesso. Contate o suporte para refazer.';
    END IF;
    UPDATE public.sync_jobs SET status = p_status, finished_at = now(), metadata = metadata || p_metadata_patch,
      locked_after_success = CASE WHEN v_should_lock THEN true ELSE locked_after_success END,
      lock_reason = CASE WHEN v_should_lock THEN v_lock_reason ELSE lock_reason END
    WHERE id = p_job_id;
  ELSE
    UPDATE public.sync_jobs SET status = p_status, metadata = metadata || p_metadata_patch WHERE id = p_job_id;
  END IF;

  INSERT INTO public.audit_logs (tenant_id, action, entity_type, entity_id, metadata)
  VALUES (v_job.tenant_id, 'mark_sync_job_' || p_status, 'sync_job', p_job_id,
    jsonb_build_object('module', v_job.module, 'scope', v_job.scope, 'locked', v_should_lock));

  RETURN jsonb_build_object('success', true, 'locked', v_should_lock);
END;
$$;

-- ============================================================
-- Trigger — billing profile is_complete + unblock
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_billing_profile_check_complete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_complete bool := false;
BEGIN
  IF NEW.person_type = 'pf' THEN
    v_complete := (NEW.cpf IS NOT NULL AND NEW.cpf <> '' AND NEW.full_name IS NOT NULL AND NEW.full_name <> '' AND
      NEW.email IS NOT NULL AND NEW.email <> '' AND NEW.address_line IS NOT NULL AND NEW.address_line <> '' AND
      NEW.address_number IS NOT NULL AND NEW.address_number <> '' AND NEW.city IS NOT NULL AND NEW.city <> '' AND
      NEW.state IS NOT NULL AND NEW.state <> '' AND NEW.zip_code IS NOT NULL AND NEW.zip_code <> '');
  ELSIF NEW.person_type = 'pj' THEN
    v_complete := (NEW.cnpj IS NOT NULL AND NEW.cnpj <> '' AND NEW.company_name IS NOT NULL AND NEW.company_name <> '' AND
      NEW.email IS NOT NULL AND NEW.email <> '' AND NEW.address_line IS NOT NULL AND NEW.address_line <> '' AND
      NEW.address_number IS NOT NULL AND NEW.address_number <> '' AND NEW.city IS NOT NULL AND NEW.city <> '' AND
      NEW.state IS NOT NULL AND NEW.state <> '' AND NEW.zip_code IS NOT NULL AND NEW.zip_code <> '');
  END IF;

  NEW.is_complete := v_complete;
  NEW.updated_at := now();

  IF v_complete AND NOT COALESCE(OLD.is_complete, false) THEN
    UPDATE public.tenants SET status = 'active', updated_at = now() WHERE id = NEW.tenant_id AND status = 'blocked_fiscal_missing';
    INSERT INTO public.audit_logs (tenant_id, action, metadata)
    VALUES (NEW.tenant_id, 'billing_completed', jsonb_build_object('person_type', NEW.person_type));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_billing_profile_complete
  BEFORE INSERT OR UPDATE ON public.tenant_billing_profile
  FOR EACH ROW EXECUTE FUNCTION public.trg_billing_profile_check_complete();

-- ============================================================
-- Seed plans
-- ============================================================
INSERT INTO public.tenant_plans (code, name, min_sales_30d, max_sales_30d, monthly_price_cents, is_active) VALUES
  ('plan_free', 'Gratuito (Trial)', 0, 50, 0, true),
  ('plan_50', 'Até 50 vendas', 0, 50, 4900, true),
  ('plan_200', 'Até 200 vendas', 51, 200, 9900, true),
  ('plan_500', 'Até 500 vendas', 201, 500, 14900, true),
  ('plan_1000', 'Até 1000 vendas', 501, 1000, 24900, true),
  ('plan_unlimited', 'Ilimitado', 1001, NULL, 49900, true);
