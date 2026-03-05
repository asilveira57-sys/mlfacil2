
-- ============================================================
-- CORREÇÃO: Atualizar tenant_plans para modelo Mercado Pago
-- ============================================================

-- 1) Adicionar colunas novas
ALTER TABLE public.tenant_plans ADD COLUMN IF NOT EXISTS mercado_pago_plan_id text;
ALTER TABLE public.tenant_plans ADD COLUMN IF NOT EXISTS is_enterprise bool NOT NULL DEFAULT false;

-- 2) Remover coluna monthly_price_cents (preços vêm do MP)
-- Primeiro precisamos atualizar as RPCs que referenciam monthly_price_cents

-- 3) Limpar planos antigos e inserir faixas oficiais
DELETE FROM public.tenant_plans;

INSERT INTO public.tenant_plans (code, name, min_sales_30d, max_sales_30d, is_active, is_enterprise) VALUES
  ('ate-50',       'Até 50 pedidos/mês',        0,    50,   true, false),
  ('51-300',       '51 a 300 pedidos/mês',      51,   300,  true, false),
  ('301-700',      '301 a 700 pedidos/mês',    301,   700,  true, false),
  ('701-1500',     '701 a 1.500 pedidos/mês',  701,  1500,  true, false),
  ('1501-3000',    '1.501 a 3.000 pedidos/mês',1501, 3000,  true, false),
  ('acima-3000',   'Acima de 3.000 pedidos/mês',3001, NULL, true, true);

-- 4) Dropar coluna de preço (agora controlado pelo MP)
ALTER TABLE public.tenant_plans DROP COLUMN IF EXISTS monthly_price_cents;

-- 5) Atualizar RPCs

-- rpc_get_required_plan: sem mudança na lógica (usa min/max_sales_30d)
-- já funciona corretamente

-- Recriar rpc_create_upgrade_quote SEM referência a monthly_price_cents
-- O upgrade agora apenas seleciona o plano MP correto, sem calcular preço
CREATE OR REPLACE FUNCTION public.rpc_create_upgrade_quote(p_tenant_id uuid, p_to_plan_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sub record; v_to_plan record; v_from_plan record; v_quote_id uuid;
  v_remaining bigint; v_total bigint;
BEGIN
  SELECT * INTO v_sub FROM public.tenant_subscription WHERE tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assinatura não encontrada'; END IF;

  SELECT * INTO v_from_plan FROM public.tenant_plans WHERE id = v_sub.plan_id;
  SELECT * INTO v_to_plan FROM public.tenant_plans WHERE id = p_to_plan_id;
  IF v_to_plan IS NULL THEN RAISE EXCEPTION 'Plano destino não encontrado'; END IF;
  IF v_to_plan.is_enterprise THEN RAISE EXCEPTION 'Plano enterprise requer contato comercial'; END IF;
  IF v_to_plan.min_sales_30d <= v_from_plan.min_sales_30d THEN RAISE EXCEPTION 'Plano destino deve ser superior ao atual'; END IF;

  IF v_sub.current_period_end IS NOT NULL AND v_sub.current_period_start IS NOT NULL THEN
    v_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_sub.current_period_end - now()))::bigint);
    v_total := GREATEST(1, EXTRACT(EPOCH FROM (v_sub.current_period_end - v_sub.current_period_start))::bigint);
  ELSE v_remaining := 2592000; v_total := 2592000; END IF;

  -- amount_due_cents = 0 porque o preço vem do Mercado Pago
  INSERT INTO public.upgrade_quotes (tenant_id, from_plan_id, to_plan_id, diff_monthly_cents, remaining_seconds_in_cycle, cycle_total_seconds, proration_factor, amount_due_cents, expires_at)
  VALUES (p_tenant_id, v_sub.plan_id, p_to_plan_id, 0, v_remaining, v_total, v_remaining::numeric / v_total::numeric, 0, now() + interval '2 hours')
  RETURNING id INTO v_quote_id;

  INSERT INTO public.audit_logs (tenant_id, action, entity_type, entity_id, metadata)
  VALUES (p_tenant_id, 'create_upgrade_quote', 'upgrade_quote', v_quote_id,
    jsonb_build_object('from_plan', v_sub.plan_id, 'to_plan', p_to_plan_id, 'mp_plan_id', v_to_plan.mercado_pago_plan_id));

  RETURN jsonb_build_object('quote_id', v_quote_id, 'from_plan_id', v_sub.plan_id, 'to_plan_id', p_to_plan_id,
    'mercado_pago_plan_id', v_to_plan.mercado_pago_plan_id, 'expires_at', (now() + interval '2 hours'));
END;
$$;

-- Nova RPC: rpc_check_downgrade_allowed
CREATE OR REPLACE FUNCTION public.rpc_check_downgrade_allowed(p_tenant_id uuid, p_to_plan_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_to_plan record; v_usage record;
BEGIN
  SELECT * INTO v_to_plan FROM public.tenant_plans WHERE id = p_to_plan_id;
  IF v_to_plan IS NULL THEN RETURN jsonb_build_object('allowed', false, 'reason', 'Plano não encontrado'); END IF;

  SELECT * INTO v_usage FROM public.tenant_usage_snapshot
    WHERE tenant_id = p_tenant_id ORDER BY computed_at DESC LIMIT 1;

  IF v_usage IS NOT NULL AND v_to_plan.max_sales_30d IS NOT NULL AND v_usage.sales_30d_total > v_to_plan.max_sales_30d THEN
    RETURN jsonb_build_object('allowed', false, 'reason',
      format('Volume atual (%s pedidos) excede o limite do plano %s (%s pedidos)', v_usage.sales_30d_total, v_to_plan.name, v_to_plan.max_sales_30d));
  END IF;

  RETURN jsonb_build_object('allowed', true);
END;
$$;

-- Nova RPC: rpc_get_compatible_plans - retorna planos compatíveis com o volume
CREATE OR REPLACE FUNCTION public.rpc_get_compatible_plans(p_sales_30d int)
RETURNS SETOF public.tenant_plans LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM public.tenant_plans
  WHERE is_active = true
    AND (max_sales_30d IS NULL OR max_sales_30d >= p_sales_30d)
  ORDER BY min_sales_30d ASC;
$$;
