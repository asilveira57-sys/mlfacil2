-- ===========================================
-- FASE 1: ESTADO ÚNICO DO USUÁRIO + FEATURE FLAGS
-- ===========================================

-- 1. Enum para status de onboarding
CREATE TYPE public.onboarding_status AS ENUM ('pending', 'completed');

-- 2. Enum para status de trial
CREATE TYPE public.trial_status AS ENUM ('none', 'active', 'expired');

-- 3. Enum para status de pagamento
CREATE TYPE public.payment_status AS ENUM ('free', 'trial', 'active', 'blocked', 'cancelled');

-- 4. Enum para role do ML
CREATE TYPE public.ml_account_role AS ENUM ('none', 'owner', 'collaborator');

-- 5. Tabela user_access_state (fonte única de verdade)
CREATE TABLE public.user_access_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Onboarding
  onboarding_status public.onboarding_status NOT NULL DEFAULT 'pending',
  onboarding_completed_at TIMESTAMPTZ,
  onboarding_objective TEXT[], -- ['labels', 'sales', 'both']
  
  -- Trial
  trial_status public.trial_status NOT NULL DEFAULT 'none',
  trial_start_at TIMESTAMPTZ,
  trial_end_at TIMESTAMPTZ,
  
  -- Plano
  selected_plan_id UUID REFERENCES public.plans(id),
  active_subscription_id UUID REFERENCES public.subscriptions(id),
  payment_status public.payment_status NOT NULL DEFAULT 'free',
  
  -- Mercado Livre
  ml_account_connected BOOLEAN NOT NULL DEFAULT false,
  ml_account_role public.ml_account_role NOT NULL DEFAULT 'none',
  ml_account_id UUID REFERENCES public.ml_accounts(id),
  
  -- Preferências definidas no onboarding
  default_print_mode TEXT DEFAULT 'zpl',
  default_label_size TEXT DEFAULT '10x15',
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Índices
CREATE INDEX idx_user_access_state_user ON public.user_access_state(user_id);
CREATE INDEX idx_user_access_state_trial ON public.user_access_state(trial_status, trial_end_at);
CREATE INDEX idx_user_access_state_payment ON public.user_access_state(payment_status);

-- 7. Trigger para updated_at
CREATE TRIGGER trg_user_access_state_updated
  BEFORE UPDATE ON public.user_access_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. RLS
ALTER TABLE public.user_access_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own access state"
  ON public.user_access_state FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own access state"
  ON public.user_access_state FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role can insert (for auto-creation on first login)
CREATE POLICY "Service can insert access state"
  ON public.user_access_state FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Users can insert own access state"
  ON public.user_access_state FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 9. Nova tabela plans_v2 com estrutura completa
CREATE TABLE public.plans_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identificação
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  plan_type TEXT NOT NULL DEFAULT 'volume', -- 'volume', 'zpl', 'completo'
  
  -- Preços
  price_cents INTEGER NOT NULL DEFAULT 0,
  billing_period TEXT NOT NULL DEFAULT 'mensal', -- 'mensal', 'trimestral', 'semestral', 'anual'
  
  -- Descrição
  description_short TEXT,
  description_long TEXT,
  features JSONB NOT NULL DEFAULT '[]',
  
  -- Limites e recursos
  limits_json JSONB NOT NULL DEFAULT '{
    "max_sales": null,
    "max_labels_per_month": null,
    "max_accounts": 1,
    "can_import_sales": true,
    "can_print_labels": true,
    "can_access_reports": true,
    "can_manage_integrations": true,
    "can_use_ai_features": false
  }',
  
  -- Requisitos
  requires_ml_owner BOOLEAN NOT NULL DEFAULT false,
  
  -- Exibição
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  badge_text TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_plans_v2_active ON public.plans_v2(is_active, display_order);
CREATE INDEX idx_plans_v2_slug ON public.plans_v2(slug);

CREATE TRIGGER trg_plans_v2_updated
  BEFORE UPDATE ON public.plans_v2
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS para plans_v2 (leitura pública, escrita admin)
ALTER TABLE public.plans_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active plans"
  ON public.plans_v2 FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage plans"
  ON public.plans_v2 FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 10. Função RPC para obter/criar estado do usuário
CREATE OR REPLACE FUNCTION public.get_or_create_user_access_state(p_user_id UUID)
RETURNS public.user_access_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.user_access_state;
  v_ml_account RECORD;
BEGIN
  -- Tentar buscar estado existente
  SELECT * INTO v_state FROM public.user_access_state WHERE user_id = p_user_id;
  
  -- Se não existe, criar com trial ativo
  IF v_state IS NULL THEN
    INSERT INTO public.user_access_state (
      user_id,
      onboarding_status,
      trial_status,
      trial_start_at,
      trial_end_at,
      payment_status
    ) VALUES (
      p_user_id,
      'pending',
      'active',
      now(),
      now() + INTERVAL '14 days',
      'trial'
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
      ml_account_role = 'owner', -- TODO: detectar real role via API
      updated_at = now()
    WHERE user_id = p_user_id
    RETURNING * INTO v_state;
  END IF;
  
  -- Verificar e atualizar status do trial automaticamente
  IF v_state.trial_status = 'active' AND v_state.trial_end_at < now() THEN
    UPDATE public.user_access_state
    SET 
      trial_status = 'expired',
      payment_status = 'blocked',
      updated_at = now()
    WHERE user_id = p_user_id
    RETURNING * INTO v_state;
  END IF;
  
  RETURN v_state;
END;
$$;

-- 11. Função RPC para calcular feature flags derivadas
CREATE OR REPLACE FUNCTION public.get_user_feature_flags(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.user_access_state;
  v_plan public.plans_v2;
  v_flags JSONB;
  v_limits JSONB;
BEGIN
  -- Garantir que estado existe
  SELECT * INTO v_state FROM public.get_or_create_user_access_state(p_user_id);
  
  -- Buscar plano se selecionado
  IF v_state.selected_plan_id IS NOT NULL THEN
    -- Tentar plans_v2 primeiro, depois plans
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
  
  -- Calcular flags
  v_flags := jsonb_build_object(
    -- Onboarding
    'requires_onboarding', v_state.onboarding_status = 'pending',
    'onboarding_completed', v_state.onboarding_status = 'completed',
    
    -- Trial
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
      COALESCE((v_limits->>'can_import_sales')::BOOLEAN, true),
    
    'can_access_reports',
      v_state.onboarding_status = 'completed' AND
      v_state.payment_status NOT IN ('blocked') AND
      COALESCE((v_limits->>'can_access_reports')::BOOLEAN, true),
    
    'can_manage_integrations',
      v_state.onboarding_status = 'completed' AND
      v_state.payment_status NOT IN ('blocked') AND
      COALESCE((v_limits->>'can_manage_integrations')::BOOLEAN, true),
    
    -- Avisos do trial (limitado + aviso)
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
    'state_version', 1
  );
  
  RETURN v_flags;
END;
$$;

-- 12. Função combinada para /me/status
CREATE OR REPLACE FUNCTION public.get_user_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_state public.user_access_state;
  v_flags JSONB;
  v_plan JSONB;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;
  
  -- Obter estado
  SELECT * INTO v_state FROM public.get_or_create_user_access_state(v_user_id);
  
  -- Obter flags
  v_flags := public.get_user_feature_flags(v_user_id);
  
  -- Obter plano selecionado
  IF v_state.selected_plan_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id', id,
      'slug', slug,
      'name', name,
      'plan_type', plan_type,
      'price_cents', price_cents,
      'billing_period', billing_period,
      'requires_ml_owner', requires_ml_owner,
      'features', features
    ) INTO v_plan
    FROM public.plans_v2 WHERE id = v_state.selected_plan_id;
  END IF;
  
  RETURN jsonb_build_object(
    'user_id', v_user_id,
    'state', jsonb_build_object(
      'onboarding_status', v_state.onboarding_status,
      'onboarding_objective', v_state.onboarding_objective,
      'trial_status', v_state.trial_status,
      'trial_start_at', v_state.trial_start_at,
      'trial_end_at', v_state.trial_end_at,
      'payment_status', v_state.payment_status,
      'ml_connected', v_state.ml_account_connected,
      'ml_role', v_state.ml_account_role,
      'default_print_mode', v_state.default_print_mode,
      'default_label_size', v_state.default_label_size
    ),
    'selected_plan', v_plan,
    'feature_flags', v_flags
  );
END;
$$;

-- 13. Função para atualizar estado do onboarding
CREATE OR REPLACE FUNCTION public.update_onboarding_state(
  p_status public.onboarding_status DEFAULT NULL,
  p_objective TEXT[] DEFAULT NULL,
  p_print_mode TEXT DEFAULT NULL,
  p_label_size TEXT DEFAULT NULL
)
RETURNS public.user_access_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_state public.user_access_state;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Garantir que estado existe
  SELECT * INTO v_state FROM public.get_or_create_user_access_state(v_user_id);
  
  -- Atualizar campos fornecidos
  UPDATE public.user_access_state
  SET
    onboarding_status = COALESCE(p_status, onboarding_status),
    onboarding_completed_at = CASE 
      WHEN p_status = 'completed' THEN now() 
      ELSE onboarding_completed_at 
    END,
    onboarding_objective = COALESCE(p_objective, onboarding_objective),
    default_print_mode = COALESCE(p_print_mode, default_print_mode),
    default_label_size = COALESCE(p_label_size, default_label_size),
    updated_at = now()
  WHERE user_id = v_user_id
  RETURNING * INTO v_state;
  
  RETURN v_state;
END;
$$;

-- 14. Função para selecionar plano
CREATE OR REPLACE FUNCTION public.select_plan(p_plan_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_plan public.plans_v2;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;
  
  -- Verificar se plano existe
  SELECT * INTO v_plan FROM public.plans_v2 WHERE id = p_plan_id AND is_active = true;
  
  IF v_plan IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'plan_not_found');
  END IF;
  
  -- Atualizar estado
  UPDATE public.user_access_state
  SET 
    selected_plan_id = p_plan_id,
    updated_at = now()
  WHERE user_id = v_user_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'plan', jsonb_build_object(
      'id', v_plan.id,
      'slug', v_plan.slug,
      'name', v_plan.name,
      'requires_ml_owner', v_plan.requires_ml_owner
    )
  );
END;
$$;