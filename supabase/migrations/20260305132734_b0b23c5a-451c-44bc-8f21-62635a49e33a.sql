
-- Drop old function with wrong return type
DROP FUNCTION IF EXISTS public.rpc_get_required_plan(integer);

-- 3) rpc_get_required_plan
CREATE OR REPLACE FUNCTION public.rpc_get_required_plan(p_sales_30d int)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan record;
BEGIN
  SELECT id, code, name, min_sales_30d, max_sales_30d, is_enterprise, mercado_pago_plan_id, display_order
  INTO v_plan
  FROM tenant_plans
  WHERE is_active = true
    AND min_sales_30d <= p_sales_30d
    AND (max_sales_30d IS NULL OR max_sales_30d >= p_sales_30d)
  ORDER BY min_sales_30d
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'No plan found for sales volume: ' || p_sales_30d);
  END IF;

  RETURN jsonb_build_object(
    'plan_id', v_plan.id,
    'code', v_plan.code,
    'name', v_plan.name,
    'min_sales_30d', v_plan.min_sales_30d,
    'max_sales_30d', v_plan.max_sales_30d,
    'is_enterprise', v_plan.is_enterprise,
    'mercado_pago_plan_id', v_plan.mercado_pago_plan_id,
    'display_order', v_plan.display_order
  );
END;
$$;

-- Drop old conflicting functions
DROP FUNCTION IF EXISTS public.rpc_get_compatible_plans(integer);
DROP FUNCTION IF EXISTS public.rpc_check_downgrade_allowed(uuid, uuid);
DROP FUNCTION IF EXISTS public.rpc_create_upgrade_quote(uuid, uuid);

-- 4) rpc_get_compatible_plans
CREATE OR REPLACE FUNCTION public.rpc_get_compatible_plans(p_sales_30d int)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(p) ORDER BY p.display_order), '[]'::jsonb)
    FROM (
      SELECT id, code, name, min_sales_30d, max_sales_30d, 
             is_enterprise, mercado_pago_plan_id, display_order
      FROM tenant_plans
      WHERE is_active = true
        AND (max_sales_30d IS NULL OR max_sales_30d >= p_sales_30d)
      ORDER BY display_order
    ) p
  );
END;
$$;

-- 5) rpc_check_downgrade_allowed
CREATE OR REPLACE FUNCTION public.rpc_check_downgrade_allowed(p_tenant_id uuid, p_target_plan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sales_30d int;
  v_target_max int;
  v_target_name text;
BEGIN
  SELECT COALESCE(sales_30d_total, 0) INTO v_sales_30d
  FROM tenant_usage_snapshot
  WHERE tenant_id = p_tenant_id
  ORDER BY computed_at DESC LIMIT 1;

  SELECT max_sales_30d, name INTO v_target_max, v_target_name
  FROM tenant_plans WHERE id = p_target_plan_id;

  IF v_target_max IS NOT NULL AND v_sales_30d > v_target_max THEN
    INSERT INTO audit_logs (tenant_id, action, metadata)
    VALUES (p_tenant_id, 'downgrade_blocked', 
      jsonb_build_object('target_plan', v_target_name, 'sales_30d', v_sales_30d, 'max_allowed', v_target_max));
    
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'Seu volume atual de ' || v_sales_30d || ' pedidos não permite downgrade para ' || v_target_name || ' (máximo: ' || v_target_max || ')'
    );
  END IF;

  RETURN jsonb_build_object('allowed', true);
END;
$$;

-- 6) rpc_create_upgrade_quote
CREATE OR REPLACE FUNCTION public.rpc_create_upgrade_quote(p_tenant_id uuid, p_to_plan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub record;
  v_from_plan record;
  v_to_plan record;
  v_remaining interval;
  v_total interval;
  v_factor numeric;
  v_quote_id uuid;
BEGIN
  SELECT * INTO v_sub FROM tenant_subscription WHERE tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Assinatura não encontrada');
  END IF;

  SELECT * INTO v_from_plan FROM tenant_plans WHERE id = v_sub.plan_id;
  SELECT * INTO v_to_plan FROM tenant_plans WHERE id = p_to_plan_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Plano destino não encontrado');
  END IF;

  IF v_to_plan.is_enterprise THEN
    RETURN jsonb_build_object('error', 'Plano enterprise requer contato comercial', 'is_enterprise', true);
  END IF;

  v_remaining := v_sub.current_period_end - now();
  v_total := v_sub.current_period_end - v_sub.current_period_start;
  v_factor := CASE WHEN extract(epoch from v_total) > 0 
    THEN extract(epoch from v_remaining) / extract(epoch from v_total)
    ELSE 1 END;

  INSERT INTO upgrade_quotes (
    tenant_id, from_plan_id, to_plan_id, currency,
    remaining_seconds_in_cycle, cycle_total_seconds, proration_factor,
    diff_monthly_cents, amount_due_cents,
    expires_at, status
  ) VALUES (
    p_tenant_id, v_sub.plan_id, p_to_plan_id, 'BRL',
    extract(epoch from v_remaining)::bigint,
    extract(epoch from v_total)::bigint,
    v_factor,
    0, 0,
    now() + interval '2 hours', 'created'
  ) RETURNING id INTO v_quote_id;

  INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, metadata)
  VALUES (p_tenant_id, 'upgrade_quote_created', 'upgrade_quotes', v_quote_id,
    jsonb_build_object('from_plan', v_from_plan.code, 'to_plan', v_to_plan.code, 'factor', v_factor));

  RETURN jsonb_build_object(
    'quote_id', v_quote_id,
    'from_plan', jsonb_build_object('code', v_from_plan.code, 'name', v_from_plan.name),
    'to_plan', jsonb_build_object('code', v_to_plan.code, 'name', v_to_plan.name, 'mercado_pago_plan_id', v_to_plan.mercado_pago_plan_id),
    'proration_factor', v_factor,
    'expires_at', now() + interval '2 hours'
  );
END;
$$;
