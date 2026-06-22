
-- ============================================================================
-- MODO ECONOMIA OPERACIONAL — Fase Webhook-Lazy
-- ============================================================================

-- 1) Desativar crons comerciais de pull automático
--    (mantém: webhook ingest/worker, shipping, billing, segurança, monitoramento)
DO $$
DECLARE
  v_job text;
BEGIN
  FOREACH v_job IN ARRAY ARRAY[
    'orders-hourly-sync-window',
    'ml-sync-messages-window',
    'qa-messages-polling-window'
  ] LOOP
    BEGIN
      PERFORM cron.unschedule(v_job);
      RAISE NOTICE 'Cron % desativado', v_job;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Cron % não encontrado (ignorado)', v_job;
    END;
  END LOOP;
END $$;

-- 2) Helper: usuário tem sessão ativa nos últimos 30min?
CREATE OR REPLACE FUNCTION public.is_user_session_active(p_user_id uuid, p_window_minutes int DEFAULT 30)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE user_id = p_user_id
       AND last_active_at IS NOT NULL
       AND last_active_at > now() - make_interval(mins => p_window_minutes)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_user_session_active(uuid, int) TO authenticated, service_role;

-- 3) Helper: dado um ml_user_id, achar dono e verificar sessão ativa
CREATE OR REPLACE FUNCTION public.is_seller_session_active(p_ml_user_id text, p_window_minutes int DEFAULT 30)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.ml_accounts a
      JOIN public.profiles p ON p.user_id = a.user_id
     WHERE a.ml_user_id = p_ml_user_id
       AND a.is_active = true
       AND p.last_active_at IS NOT NULL
       AND p.last_active_at > now() - make_interval(mins => p_window_minutes)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_seller_session_active(text, int) TO authenticated, service_role;

-- 4) Reforçar can_run_auto_sync: exigir sessão ativa nos últimos 30min
CREATE OR REPLACE FUNCTION public.can_run_auto_sync(p_user_id uuid, p_module text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_now_brt    timestamp;
  v_hour       int;
  v_dow        int;
  v_last_login timestamptz;
  v_last_active timestamptz;
  v_paused     boolean;
  v_enabled    boolean;
  v_h_start    int;
  v_h_end      int;
  v_h_sat_end  int;
  v_allowed    jsonb;
  v_session_window_min int;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_user');
  END IF;

  v_enabled := COALESCE((public._economy_setting('economy_mode.enabled','true'::jsonb))::text::boolean, true);
  IF NOT v_enabled THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'economy_mode_disabled');
  END IF;

  SELECT last_login_at, last_active_at, COALESCE(auto_sync_paused,false)
    INTO v_last_login, v_last_active, v_paused
    FROM public.profiles WHERE user_id = p_user_id LIMIT 1;

  IF v_paused THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'user_paused');
  END IF;

  IF v_last_login IS NULL OR v_last_login < now() - interval '3 days' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'inactive_user');
  END IF;

  -- NOVO: exige sessão ativa (heartbeat) nos últimos 30min
  v_session_window_min := COALESCE(
    (public._economy_setting('economy_mode.session_window_minutes','30'::jsonb))::text::int,
    30
  );
  IF v_last_active IS NULL OR v_last_active < now() - make_interval(mins => v_session_window_min) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_active_session');
  END IF;

  v_allowed := public._economy_setting(
    'economy_mode.allowed_modules',
    '["shipping_labels","shipping_full","messages","qa"]'::jsonb
  );
  IF NOT (v_allowed ? p_module) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'module_not_whitelisted');
  END IF;

  v_now_brt := (now() AT TIME ZONE 'America/Sao_Paulo');
  v_hour    := EXTRACT(HOUR FROM v_now_brt)::int;
  v_dow     := EXTRACT(DOW  FROM v_now_brt)::int;

  v_h_start   := COALESCE((public._economy_setting('economy_mode.window_start_hour','7'::jsonb))::text::int, 7);
  v_h_end     := COALESCE((public._economy_setting('economy_mode.window_end_hour','19'::jsonb))::text::int, 19);
  v_h_sat_end := COALESCE((public._economy_setting('economy_mode.saturday_end_hour','12'::jsonb))::text::int, 12);

  IF v_dow = 0 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'sunday_blocked');
  END IF;

  IF v_dow = 6 THEN
    IF v_hour < v_h_start OR v_hour >= v_h_sat_end THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'saturday_economy');
    END IF;
    RETURN jsonb_build_object('allowed', true, 'reason', 'ok');
  END IF;

  IF v_hour < v_h_start OR v_hour >= v_h_end THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'outside_hours');
  END IF;

  RETURN jsonb_build_object('allowed', true, 'reason', 'ok');
END;
$function$;
