
CREATE OR REPLACE FUNCTION public.check_ml_api_access(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company RECORD;
  v_subscription RECORD;
  v_entitlement RECORD;
BEGIN
  -- Buscar company do usuário
  SELECT c.*,
         COALESCE(c.trial_status, 'none') as eff_trial_status
  INTO v_company
  FROM public.companies c
  WHERE c.user_id = p_user_id AND c.is_active = true
  ORDER BY c.trial_started_at DESC NULLS LAST
  LIMIT 1;

  IF v_company IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'no_company',
      'error_code', 'NO_COMPANY',
      'message', 'Nenhuma empresa encontrada.'
    );
  END IF;

  -- Buscar subscription ativa (sistema legado)
  SELECT s.*, pv.plan_type, pv.slug as plan_slug
  INTO v_subscription
  FROM public.subscriptions s
  LEFT JOIN public.plans_v2 pv ON pv.id = s.plan_id
  WHERE s.company_id = v_company.id
    AND s.status = 'active'
  LIMIT 1;

  -- Verificar se plano legado é ZPL → negar ML API
  IF v_subscription IS NOT NULL AND v_subscription.plan_type = 'zpl' THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'zpl_plan',
      'error_code', 'ZPL_PLAN',
      'message', 'Plano ZPL não inclui acesso à API do Mercado Livre.'
    );
  END IF;

  -- Plano legado pago ativo (não ZPL) → permitir
  IF v_subscription IS NOT NULL AND v_subscription.status = 'active' THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'reason', 'active_subscription',
      'trial_ends_at', v_company.trial_ends_at
    );
  END IF;

  -- ═══ FALLBACK: tenant_entitlements (sistema novo) ═══
  -- Busca por AMBOS: company.id E company.tenant_id
  SELECT te.*, pt.plan_group as tier_plan_group, pt.code as tier_code
  INTO v_entitlement
  FROM public.tenant_entitlements te
  LEFT JOIN public.plan_tiers pt ON pt.id = te.tier_id
  WHERE te.tenant_id IN (v_company.id, COALESCE(v_company.tenant_id, v_company.id))
    AND te.status = 'active'
    AND te.current_period_end > now()
  ORDER BY te.current_period_end DESC
  LIMIT 1;

  -- Entitlement ativo encontrado
  IF v_entitlement IS NOT NULL THEN
    -- ZPL tier → negar ML API
    IF v_entitlement.tier_plan_group = 'zpl' THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'zpl_plan',
        'error_code', 'ZPL_PLAN',
        'message', 'Plano ZPL não inclui acesso à API do Mercado Livre.'
      );
    END IF;

    -- Tier ativo não-ZPL → permitir
    RETURN jsonb_build_object(
      'allowed', true,
      'reason', 'active_entitlement',
      'trial_ends_at', v_company.trial_ends_at
    );
  END IF;

  -- Trial ativo e não expirado → permitir
  IF v_company.eff_trial_status = 'active' AND v_company.trial_ends_at > now() THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'reason', 'active_trial',
      'trial_ends_at', v_company.trial_ends_at,
      'trial_days_remaining', GREATEST(0, EXTRACT(DAY FROM (v_company.trial_ends_at - now()))::integer)
    );
  END IF;

  -- Trial expirado → atualizar status automaticamente
  IF v_company.trial_started_at IS NOT NULL
     AND (v_company.eff_trial_status != 'expired')
     AND v_company.trial_ends_at <= now() THEN
    UPDATE public.companies
    SET trial_status = 'expired', updated_at = now()
    WHERE id = v_company.id;
  END IF;

  -- Sem trial → negar
  IF v_company.trial_started_at IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'no_trial',
      'error_code', 'NO_TRIAL',
      'message', 'Conecte uma conta do Mercado Livre para iniciar seu período de teste.'
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', false,
    'reason', 'trial_expired',
    'error_code', 'TRIAL_EXPIRED',
    'message', 'Trial expirado. Assine um plano para continuar sincronizando.',
    'trial_ends_at', v_company.trial_ends_at
  );
END;
$$;
