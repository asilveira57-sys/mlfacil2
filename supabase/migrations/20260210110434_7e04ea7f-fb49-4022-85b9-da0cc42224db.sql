
-- ================================================================
-- TRIAL POR COMPANY + BOOTSTRAP + ML API GATE
-- ================================================================

-- 1. Adicionar campos de trial em companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_status text DEFAULT NULL;

-- 2. Estender sync_jobs para bootstrap idempotente
ALTER TABLE public.sync_jobs
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id),
  ADD COLUMN IF NOT EXISTS ml_account_id uuid REFERENCES public.ml_accounts(id),
  ADD COLUMN IF NOT EXISTS window_start timestamptz,
  ADD COLUMN IF NOT EXISTS window_end timestamptz;

-- Índice único para idempotência do bootstrap
CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_jobs_bootstrap_idempotent
  ON public.sync_jobs (company_id, ml_account_id, job_type, window_start, window_end)
  WHERE company_id IS NOT NULL AND ml_account_id IS NOT NULL;

-- 3. Função check_ml_api_access: gate central para edge functions
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
  -- Buscar company do usuário
  SELECT c.*, 
         COALESCE(c.trial_status, 'none') as eff_trial_status
  INTO v_company
  FROM public.companies c
  WHERE c.user_id = p_user_id AND c.is_active = true
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

-- 4. Função start_company_trial: chamada pelo OAuth callback
CREATE OR REPLACE FUNCTION public.start_company_trial(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company RECORD;
BEGIN
  SELECT * INTO v_company FROM public.companies WHERE id = p_company_id;
  
  IF v_company IS NULL THEN
    RETURN jsonb_build_object('started', false, 'reason', 'company_not_found');
  END IF;

  -- Não reiniciar trial se já começou (anti-fraude)
  IF v_company.trial_started_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'started', false, 
      'reason', 'already_started',
      'trial_started_at', v_company.trial_started_at,
      'trial_ends_at', v_company.trial_ends_at
    );
  END IF;

  UPDATE public.companies
  SET 
    trial_started_at = now(),
    trial_ends_at = now() + INTERVAL '14 days',
    trial_status = 'active',
    updated_at = now()
  WHERE id = p_company_id;

  -- Sincronizar trial para user_access_state do dono da company
  UPDATE public.user_access_state
  SET
    trial_status = 'active',
    trial_start_at = now(),
    trial_end_at = now() + INTERVAL '14 days',
    payment_status = 'trial',
    updated_at = now()
  WHERE user_id = v_company.user_id
    AND (trial_status = 'none' OR trial_start_at IS NULL);

  RETURN jsonb_build_object(
    'started', true,
    'trial_started_at', now(),
    'trial_ends_at', now() + INTERVAL '14 days'
  );
END;
$$;

-- 5. Atualizar get_or_create_user_access_state para NÃO auto-iniciar trial
CREATE OR REPLACE FUNCTION public.get_or_create_user_access_state(p_user_id uuid)
RETURNS public.user_access_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.user_access_state;
  v_ml_account RECORD;
  v_company RECORD;
BEGIN
  -- Tentar buscar estado existente
  SELECT * INTO v_state FROM public.user_access_state WHERE user_id = p_user_id;
  
  -- Se não existe, criar SEM trial (trial começa no OAuth)
  IF v_state IS NULL THEN
    INSERT INTO public.user_access_state (
      user_id,
      onboarding_status,
      trial_status,
      payment_status
    ) VALUES (
      p_user_id,
      'pending',
      'none',
      'free'
    )
    RETURNING * INTO v_state;
  END IF;
  
  -- Atualizar info de conta ML se existir
  SELECT id, is_active INTO v_ml_account 
  FROM public.ml_accounts 
  WHERE user_id = p_user_id AND is_active = true
  LIMIT 1;
  
  IF v_ml_account.id IS NOT NULL THEN
    UPDATE public.user_access_state 
    SET 
      ml_account_connected = true,
      ml_account_id = v_ml_account.id,
      ml_account_role = 'owner',
      updated_at = now()
    WHERE user_id = p_user_id
    RETURNING * INTO v_state;
  END IF;
  
  -- Sincronizar trial da company se existir
  SELECT * INTO v_company 
  FROM public.companies 
  WHERE user_id = p_user_id AND is_active = true 
  LIMIT 1;

  IF v_company IS NOT NULL AND v_company.trial_started_at IS NOT NULL THEN
    -- Atualizar trial_status baseado na company (source of truth)
    IF v_company.trial_ends_at < now() THEN
      UPDATE public.user_access_state
      SET 
        trial_status = 'expired',
        trial_start_at = v_company.trial_started_at,
        trial_end_at = v_company.trial_ends_at,
        payment_status = CASE 
          WHEN payment_status IN ('active') THEN payment_status 
          ELSE 'blocked' 
        END,
        updated_at = now()
      WHERE user_id = p_user_id
      RETURNING * INTO v_state;
    ELSE
      UPDATE public.user_access_state
      SET 
        trial_status = 'active',
        trial_start_at = v_company.trial_started_at,
        trial_end_at = v_company.trial_ends_at,
        payment_status = CASE
          WHEN payment_status = 'active' THEN 'active'
          ELSE 'trial'
        END,
        updated_at = now()
      WHERE user_id = p_user_id
      RETURNING * INTO v_state;
    END IF;
  END IF;
  
  RETURN v_state;
END;
$$;

-- 6. Atualizar get_user_feature_flags para incluir ml_api_access
CREATE OR REPLACE FUNCTION public.get_user_feature_flags(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.user_access_state;
  v_plan public.plans_v2;
  v_flags JSONB;
  v_limits JSONB;
  v_ml_access JSONB;
BEGIN
  -- Garantir que estado existe (agora sincroniza trial da company)
  SELECT * INTO v_state FROM public.get_or_create_user_access_state(p_user_id);
  
  -- Buscar plano se selecionado
  IF v_state.selected_plan_id IS NOT NULL THEN
    SELECT * INTO v_plan FROM public.plans_v2 WHERE id = v_state.selected_plan_id;
    IF v_plan IS NULL THEN
      SELECT limits_json INTO v_limits FROM public.plans WHERE id = v_state.selected_plan_id;
    ELSE
      v_limits := v_plan.limits_json;
    END IF;
  END IF;
  
  -- Defaults
  v_limits := COALESCE(v_limits, '{
    "can_import_sales": true,
    "can_print_labels": true,
    "can_access_reports": true,
    "can_manage_integrations": true
  }'::JSONB);

  -- Checar acesso ML API
  v_ml_access := public.check_ml_api_access(p_user_id);
  
  -- Calcular flags
  v_flags := jsonb_build_object(
    -- Onboarding
    'requires_onboarding', v_state.onboarding_status = 'pending',
    'onboarding_completed', v_state.onboarding_status = 'completed',
    
    -- Trial (derivado da company via user_access_state sync)
    'trial_active', v_state.trial_status = 'active' AND v_state.trial_end_at > now(),
    'trial_expired', v_state.trial_status = 'expired' OR (v_state.trial_status = 'active' AND v_state.trial_end_at <= now()),
    'trial_days_remaining', GREATEST(0, EXTRACT(DAY FROM (v_state.trial_end_at - now()))::INTEGER),
    'trial_end_at', v_state.trial_end_at,
    
    -- Pagamento
    'requires_payment', v_state.payment_status IN ('blocked', 'cancelled') OR 
      (v_state.trial_status = 'active' AND v_state.trial_end_at <= now()),
    'has_active_subscription', v_state.payment_status = 'active',
    
    -- Mercado Livre
    'ml_connected', v_state.ml_account_connected,
    'ml_is_owner', v_state.ml_account_role = 'owner',
    'ml_is_collaborator', v_state.ml_account_role = 'collaborator',
    'ml_requires_owner_warning', 
      v_plan IS NOT NULL AND v_plan.requires_ml_owner AND v_state.ml_account_role = 'collaborator',
    
    -- ML API Access (NOVO - gate de acesso)
    'ml_api_access_allowed', COALESCE((v_ml_access->>'allowed')::boolean, false),
    'ml_api_access_reason', v_ml_access->>'reason',
    'ml_api_access_message', v_ml_access->>'message',
    
    -- Recursos (aplicar regras)
    'can_print_labels', 
      v_state.onboarding_status = 'completed' AND 
      v_state.payment_status NOT IN ('blocked') AND
      COALESCE((v_limits->>'can_print_labels')::BOOLEAN, true),
    
    'can_import_sales',
      v_state.onboarding_status = 'completed' AND
      v_state.payment_status NOT IN ('blocked') AND
      v_state.ml_account_connected AND
      v_state.ml_account_role = 'owner' AND
      COALESCE((v_ml_access->>'allowed')::boolean, false) AND
      COALESCE((v_limits->>'can_import_sales')::BOOLEAN, true),
    
    'can_access_reports',
      v_state.onboarding_status = 'completed' AND
      v_state.payment_status NOT IN ('blocked') AND
      COALESCE((v_limits->>'can_access_reports')::BOOLEAN, true),
    
    'can_manage_integrations',
      v_state.onboarding_status = 'completed' AND
      v_state.payment_status NOT IN ('blocked') AND
      COALESCE((v_limits->>'can_manage_integrations')::BOOLEAN, true),
    
    -- Avisos do trial
    'trial_warnings', CASE 
      WHEN v_state.trial_status = 'active' AND v_state.ml_account_role = 'collaborator' AND 
           v_plan IS NOT NULL AND v_plan.requires_ml_owner 
      THEN jsonb_build_array(
        'O plano selecionado requer conta titular do Mercado Livre. Durante o teste, você pode avaliar a impressão de etiquetas. Para importar vendas após o teste, conecte uma conta titular.'
      )
      ELSE '[]'::JSONB
    END,
    
    -- Meta
    'computed_at', now(),
    'state_version', 2
  );
  
  RETURN v_flags;
END;
$$;

-- 7. Grant execute
GRANT EXECUTE ON FUNCTION public.check_ml_api_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_company_trial(uuid) TO service_role;
