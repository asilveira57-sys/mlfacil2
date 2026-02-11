-- Fix: RPC should pick the company with active trial/subscription first
CREATE OR REPLACE FUNCTION public.check_ml_api_access(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company RECORD;
  v_plan RECORD;
  v_subscription RECORD;
  v_result jsonb;
BEGIN
  -- Buscar company do usuário, priorizando a que tem trial ativo
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

  -- Buscar subscription ativa
  SELECT s.*, pv.plan_type, pv.slug as plan_slug
  INTO v_subscription
  FROM public.subscriptions s
  LEFT JOIN public.plans_v2 pv ON pv.id = s.plan_id
  WHERE s.company_id = v_company.id 
    AND s.status = 'active'
  LIMIT 1;

  -- Verificar se plano é ZPL → negar sempre ML API
  IF v_subscription IS NOT NULL AND v_subscription.plan_type = 'zpl' THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'zpl_plan',
      'error_code', 'ZPL_PLAN',
      'message', 'Plano ZPL não inclui acesso à API do Mercado Livre.'
    );
  END IF;

  -- Plano pago ativo (não ZPL) → permitir
  IF v_subscription IS NOT NULL AND v_subscription.status = 'active' THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'reason', 'active_subscription',
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

  -- Trial expirado → atualizar status automaticamente e negar
  IF v_company.trial_started_at IS NOT NULL 
     AND (v_company.eff_trial_status != 'expired') 
     AND v_company.trial_ends_at <= now() THEN
    UPDATE public.companies 
    SET trial_status = 'expired', updated_at = now()
    WHERE id = v_company.id;
  END IF;

  -- Sem trial e sem plano → negar
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

-- Also backfill the orphan company
UPDATE public.companies
SET trial_started_at = now(),
    trial_ends_at = now() + interval '14 days',
    trial_status = 'active',
    updated_at = now()
WHERE id = 'bf1b9ced-ac24-47a2-9620-f0c1ce5cc6d5'
  AND trial_started_at IS NULL;