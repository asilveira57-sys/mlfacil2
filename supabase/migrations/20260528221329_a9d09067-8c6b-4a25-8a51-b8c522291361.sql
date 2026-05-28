
-- ============================================================
-- MODO ECONÔMICO MKTP FÁCIL — Fase 1
-- Infraestrutura de elegibilidade de sync automático
-- ============================================================

-- 1) Atividade do usuário em profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_sync_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_sync_paused_reason text,
  ADD COLUMN IF NOT EXISTS auto_sync_reactivated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_last_login_at ON public.profiles(last_login_at);
CREATE INDEX IF NOT EXISTS idx_profiles_last_active_at ON public.profiles(last_active_at);

-- 2) Tabela de logs de decisão de sync
CREATE TABLE IF NOT EXISTS public.system_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  seller_id text,
  user_id uuid,
  module_name text NOT NULL,
  action text NOT NULL,           -- 'auto_sync', 'manual_sync', 'background_preload', etc
  status text NOT NULL,           -- 'allowed', 'blocked', 'executed', 'error'
  reason text,                    -- 'paused_module','outside_hours','weekend','inactive_user','manual_override','label_teste_disabled','cost_12m_blocked', etc
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,
  records_processed integer,
  api_calls_count integer,
  tokens_used integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.system_sync_logs TO authenticated;
GRANT ALL ON public.system_sync_logs TO service_role;

ALTER TABLE public.system_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_sync_logs_user_created
  ON public.system_sync_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_logs_module_created
  ON public.system_sync_logs(module_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_logs_status_created
  ON public.system_sync_logs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_logs_tenant_created
  ON public.system_sync_logs(tenant_id, created_at DESC);

-- Policies: user reads own; admins read all; insert allowed for own user
DROP POLICY IF EXISTS "Users read own sync logs" ON public.system_sync_logs;
CREATE POLICY "Users read own sync logs"
  ON public.system_sync_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins read all sync logs" ON public.system_sync_logs;
CREATE POLICY "Admins read all sync logs"
  ON public.system_sync_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users insert own sync logs" ON public.system_sync_logs;
CREATE POLICY "Users insert own sync logs"
  ON public.system_sync_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- 3) Função central de elegibilidade — escopo America/Sao_Paulo
CREATE OR REPLACE FUNCTION public.can_run_auto_sync(
  p_user_id uuid,
  p_module text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now_brt timestamp;
  v_hour int;
  v_dow int;       -- 0=sun..6=sat
  v_last_login timestamptz;
  v_paused boolean;
  v_paused_modules text[] := ARRAY[
    'ad_timeline','radiografia','promotions','ads','seed',
    'abc','custos','frete','ajuste_preco','atacado','trends','mercado'
  ];
  v_allowed_modules text[] := ARRAY['shipping_labels','shipping_full'];
BEGIN
  -- usuário desconhecido: bloqueia silenciosamente
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_user');
  END IF;

  SELECT last_login_at, COALESCE(auto_sync_paused,false)
    INTO v_last_login, v_paused
    FROM public.profiles WHERE user_id = p_user_id LIMIT 1;

  IF v_paused THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'user_paused');
  END IF;

  -- 3 dias sem login -> bloqueia
  IF v_last_login IS NULL OR v_last_login < now() - interval '3 days' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'inactive_user');
  END IF;

  -- módulo explicitamente pausado
  IF p_module = ANY(v_paused_modules) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'paused_module');
  END IF;

  -- somente módulos de etiquetas dentro da janela
  IF NOT (p_module = ANY(v_allowed_modules)) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'module_not_whitelisted');
  END IF;

  -- janela horária BRT
  v_now_brt := (now() AT TIME ZONE 'America/Sao_Paulo');
  v_hour := EXTRACT(HOUR FROM v_now_brt)::int;
  v_dow  := EXTRACT(DOW  FROM v_now_brt)::int;

  -- bloqueio 20:00–06:00
  IF v_hour >= 20 OR v_hour < 6 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'outside_hours');
  END IF;

  -- sábado >=15:00 e domingo inteiro
  IF v_dow = 0 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'weekend');
  END IF;
  IF v_dow = 6 AND v_hour >= 15 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'weekend');
  END IF;

  RETURN jsonb_build_object('allowed', true, 'reason', 'ok');
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_run_auto_sync(uuid, text) TO authenticated, service_role;

-- 4) Função utilitária para gravar log (security definer p/ edge functions)
CREATE OR REPLACE FUNCTION public.log_sync_decision(
  p_module text,
  p_action text,
  p_status text,
  p_reason text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL,
  p_seller_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.system_sync_logs(
    user_id, tenant_id, seller_id, module_name, action, status, reason, metadata, started_at
  ) VALUES (
    COALESCE(p_user_id, auth.uid()), p_tenant_id, p_seller_id,
    p_module, p_action, p_status, p_reason, COALESCE(p_metadata,'{}'::jsonb), now()
  ) RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;  -- fail-safe
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_sync_decision(text,text,text,text,uuid,uuid,text,jsonb) TO authenticated, service_role;

-- 5) Função de touch de atividade
CREATE OR REPLACE FUNCTION public.touch_user_activity(p_user_id uuid, p_is_login boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_is_login THEN
    UPDATE public.profiles
       SET last_login_at = now(), last_active_at = now()
     WHERE user_id = p_user_id;
  ELSE
    UPDATE public.profiles
       SET last_active_at = now()
     WHERE user_id = p_user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.touch_user_activity(uuid, boolean) TO authenticated, service_role;

-- 6) Backfill: marca todos os usuários existentes como tendo logado agora,
-- evitando bloqueio em massa por "inactive_user" no primeiro deploy.
UPDATE public.profiles
   SET last_login_at = COALESCE(last_login_at, now()),
       last_active_at = COALESCE(last_active_at, now())
 WHERE last_login_at IS NULL;

-- 7) Pausar Label Teste no menu (system_modules)
UPDATE public.system_modules
   SET is_active = false,
       description = COALESCE(description,'') || ' [pausado para controle de custo — 2026-05]'
 WHERE key = 'marketplace.sales.label_teste';
