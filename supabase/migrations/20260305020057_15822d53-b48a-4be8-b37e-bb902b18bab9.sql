
-- Phase 3: Multi-account, plan limits, account states, pro-rata upgrade

-- 1. Account state enum
DO $$ BEGIN
  CREATE TYPE public.account_state AS ENUM ('active', 'pending_upgrade', 'disabled', 'error');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add account_state to marketplace_accounts
ALTER TABLE public.marketplace_accounts 
  ADD COLUMN IF NOT EXISTS account_state public.account_state DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS sales_30d integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_sales_check_at timestamptz;

-- 3. Tenant sales limit log for audit
CREATE TABLE IF NOT EXISTS public.tenant_limit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  event_type text NOT NULL, -- 'account_added', 'limit_check', 'upgrade_required', 'upgrade_completed', 'limit_exceeded', 'account_blocked'
  account_id uuid REFERENCES public.marketplace_accounts(id),
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.tenant_limit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tenant logs"
  ON public.tenant_limit_log FOR SELECT TO authenticated
  USING (company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid()));

-- 4. Function: Calculate total 30d sales across all accounts of a company
CREATE OR REPLACE FUNCTION public.get_tenant_total_sales(p_company_id uuid)
RETURNS TABLE(
  total_sales_30d bigint,
  total_revenue_30d numeric,
  accounts_count integer,
  accounts_detail jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_date_from date := CURRENT_DATE - 30;
BEGIN
  RETURN QUERY
  WITH account_sales AS (
    SELECT 
      ma.id as account_id,
      ma.account_label,
      ma.external_user_id as seller_id,
      ma.account_state,
      COUNT(DISTINCT o.order_id) as sales_count,
      COALESCE(SUM(o.total_amount), 0) as revenue
    FROM public.marketplace_accounts ma
    LEFT JOIN public.meli_orders_cache o 
      ON o.seller_id = ma.external_user_id
      AND o.order_status = 'paid'
      AND (o.created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date >= v_date_from
    WHERE ma.company_id = p_company_id
      AND ma.is_active = true
    GROUP BY ma.id, ma.account_label, ma.external_user_id, ma.account_state
  )
  SELECT 
    COALESCE(SUM(a.sales_count), 0)::bigint as total_sales_30d,
    COALESCE(SUM(a.revenue), 0) as total_revenue_30d,
    COUNT(*)::integer as accounts_count,
    COALESCE(jsonb_agg(jsonb_build_object(
      'account_id', a.account_id,
      'label', a.account_label,
      'seller_id', a.seller_id,
      'state', a.account_state,
      'sales_30d', a.sales_count,
      'revenue_30d', a.revenue
    )), '[]'::jsonb) as accounts_detail
  FROM account_sales a;
END;
$$;

-- 5. Function: Check if tenant exceeds plan limit and return status
CREATE OR REPLACE FUNCTION public.check_tenant_plan_limit(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_plan record;
  v_tenant_sales record;
  v_max_sales integer;
  v_exceeds boolean;
BEGIN
  -- Get company owner
  SELECT user_id INTO v_user_id FROM public.companies WHERE id = p_company_id;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'company_not_found');
  END IF;

  -- Get active plan
  SELECT pv.*, s.current_period_end, s.status as sub_status, s.plan_price_cents
  INTO v_plan
  FROM public.subscriptions s
  JOIN public.plans_v2 pv ON pv.id = s.plan_id
  WHERE s.company_id = p_company_id AND s.status = 'active'
  ORDER BY s.created_at DESC
  LIMIT 1;

  -- Get max_sales from plan limits_json
  IF v_plan IS NOT NULL THEN
    v_max_sales := COALESCE((v_plan.limits_json->>'max_sales')::integer, 99999);
  ELSE
    -- Trial or no plan: use company trial info
    v_max_sales := 300; -- default trial limit
  END IF;

  -- Get total sales
  SELECT * INTO v_tenant_sales FROM public.get_tenant_total_sales(p_company_id);

  v_exceeds := v_tenant_sales.total_sales_30d > v_max_sales;

  RETURN jsonb_build_object(
    'company_id', p_company_id,
    'total_sales_30d', v_tenant_sales.total_sales_30d,
    'total_revenue_30d', v_tenant_sales.total_revenue_30d,
    'accounts_count', v_tenant_sales.accounts_count,
    'plan_max_sales', v_max_sales,
    'plan_name', v_plan.name,
    'plan_slug', v_plan.slug,
    'plan_price_cents', v_plan.plan_price_cents,
    'exceeds_limit', v_exceeds,
    'usage_percent', CASE WHEN v_max_sales > 0 THEN ROUND((v_tenant_sales.total_sales_30d::numeric / v_max_sales) * 100, 1) ELSE 0 END,
    'current_period_end', v_plan.current_period_end,
    'accounts_detail', v_tenant_sales.accounts_detail
  );
END;
$$;

-- 6. Function: Calculate pro-rata upgrade price
CREATE OR REPLACE FUNCTION public.calculate_prorata_upgrade(p_company_id uuid, p_new_plan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_sub record;
  v_new_plan record;
  v_days_total integer;
  v_days_remaining integer;
  v_daily_current numeric;
  v_daily_new numeric;
  v_prorata_amount numeric;
  v_credit numeric;
BEGIN
  -- Get current subscription
  SELECT s.*, pv.price_cents as current_price
  INTO v_current_sub
  FROM public.subscriptions s
  LEFT JOIN public.plans_v2 pv ON pv.id = s.plan_id
  WHERE s.company_id = p_company_id AND s.status = 'active'
  ORDER BY s.created_at DESC
  LIMIT 1;

  -- Get new plan
  SELECT * INTO v_new_plan FROM public.plans_v2 WHERE id = p_new_plan_id AND is_active = true;
  IF v_new_plan IS NULL THEN
    RETURN jsonb_build_object('error', 'plan_not_found');
  END IF;

  IF v_current_sub IS NULL THEN
    -- No current plan, full price
    RETURN jsonb_build_object(
      'new_plan_id', v_new_plan.id,
      'new_plan_name', v_new_plan.name,
      'new_plan_price_cents', v_new_plan.price_cents,
      'prorata_amount_cents', v_new_plan.price_cents,
      'credit_cents', 0,
      'charge_cents', v_new_plan.price_cents,
      'days_remaining', 30,
      'days_total', 30
    );
  END IF;

  -- Calculate days
  v_days_total := GREATEST(1, EXTRACT(DAY FROM (v_current_sub.current_period_end::timestamptz - v_current_sub.current_period_start::timestamptz))::integer);
  v_days_remaining := GREATEST(0, EXTRACT(DAY FROM (v_current_sub.current_period_end::timestamptz - now()))::integer);

  -- Daily rates
  v_daily_current := COALESCE(v_current_sub.current_price, v_current_sub.plan_price_cents, 0)::numeric / v_days_total;
  v_daily_new := v_new_plan.price_cents::numeric / v_days_total;

  -- Credit for unused days of current plan
  v_credit := v_daily_current * v_days_remaining;
  
  -- Charge for remaining days on new plan
  v_prorata_amount := v_daily_new * v_days_remaining;

  RETURN jsonb_build_object(
    'current_plan_price_cents', COALESCE(v_current_sub.current_price, v_current_sub.plan_price_cents, 0),
    'new_plan_id', v_new_plan.id,
    'new_plan_name', v_new_plan.name,
    'new_plan_price_cents', v_new_plan.price_cents,
    'days_remaining', v_days_remaining,
    'days_total', v_days_total,
    'credit_cents', ROUND(v_credit),
    'prorata_amount_cents', ROUND(v_prorata_amount),
    'charge_cents', GREATEST(0, ROUND(v_prorata_amount - v_credit))
  );
END;
$$;

-- 7. Function: Execute upgrade (update subscription + unblock accounts)
CREATE OR REPLACE FUNCTION public.execute_plan_upgrade(p_company_id uuid, p_new_plan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sub_id uuid;
  v_new_plan record;
  v_prorata jsonb;
BEGIN
  SELECT * INTO v_new_plan FROM public.plans_v2 WHERE id = p_new_plan_id AND is_active = true;
  IF v_new_plan IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'plan_not_found');
  END IF;

  -- Calculate pro-rata for logging
  v_prorata := public.calculate_prorata_upgrade(p_company_id, p_new_plan_id);

  -- Update subscription
  UPDATE public.subscriptions
  SET plan_id = p_new_plan_id,
      plan_name = v_new_plan.name,
      plan_price_cents = v_new_plan.price_cents,
      plan_type = v_new_plan.plan_type,
      updated_at = now()
  WHERE company_id = p_company_id AND status = 'active'
  RETURNING id INTO v_sub_id;

  -- Unblock all pending_upgrade accounts
  UPDATE public.marketplace_accounts
  SET account_state = 'active'
  WHERE company_id = p_company_id AND account_state = 'pending_upgrade';

  -- Log the upgrade
  INSERT INTO public.tenant_limit_log (company_id, event_type, details)
  VALUES (p_company_id, 'upgrade_completed', jsonb_build_object(
    'new_plan_id', p_new_plan_id,
    'new_plan_name', v_new_plan.name,
    'prorata', v_prorata
  ));

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', v_sub_id,
    'new_plan', v_new_plan.name,
    'prorata', v_prorata
  );
END;
$$;

-- 8. Function: Handle new account connection — check limits
CREATE OR REPLACE FUNCTION public.on_account_connected_check_limit(p_company_id uuid, p_account_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_limit_check jsonb;
BEGIN
  -- Log the connection attempt
  INSERT INTO public.tenant_limit_log (company_id, account_id, event_type, details)
  VALUES (p_company_id, p_account_id, 'account_added', '{}'::jsonb);

  -- Check plan limits
  v_limit_check := public.check_tenant_plan_limit(p_company_id);

  IF (v_limit_check->>'exceeds_limit')::boolean = true THEN
    -- Mark account as pending_upgrade
    UPDATE public.marketplace_accounts
    SET account_state = 'pending_upgrade'
    WHERE id = p_account_id;

    -- Log the block
    INSERT INTO public.tenant_limit_log (company_id, account_id, event_type, details)
    VALUES (p_company_id, p_account_id, 'upgrade_required', v_limit_check);

    RETURN jsonb_build_object(
      'status', 'pending_upgrade',
      'message', 'As vendas da nova conta ultrapassam o limite do plano atual. É necessário fazer upgrade.',
      'limit_check', v_limit_check
    );
  ELSE
    -- Account is fine
    UPDATE public.marketplace_accounts
    SET account_state = 'active'
    WHERE id = p_account_id;

    INSERT INTO public.tenant_limit_log (company_id, account_id, event_type, details)
    VALUES (p_company_id, p_account_id, 'limit_check', v_limit_check);

    RETURN jsonb_build_object(
      'status', 'active',
      'message', 'Conta ativada com sucesso.',
      'limit_check', v_limit_check
    );
  END IF;
END;
$$;
