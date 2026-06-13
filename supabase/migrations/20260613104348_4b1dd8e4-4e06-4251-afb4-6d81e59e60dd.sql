
-- 1) Seed platform_settings flags (kill switches)
INSERT INTO public.platform_settings (key, value)
VALUES
  ('economy_mode.enabled', 'true'::jsonb),
  ('economy_mode.window_start_hour', '7'::jsonb),
  ('economy_mode.window_end_hour', '19'::jsonb),
  ('economy_mode.saturday_end_hour', '12'::jsonb),
  ('economy_mode.allowed_modules', '["shipping_labels","shipping_full","messages","qa"]'::jsonb),
  ('economy_mode.cron_gate_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 2) Helper to read a setting with fallback (no exception if missing)
CREATE OR REPLACE FUNCTION public._economy_setting(p_key text, p_default jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT value FROM public.platform_settings WHERE key = p_key LIMIT 1), p_default)
$$;

-- 3) Updated can_run_auto_sync with new window, saturday rule, killswitch, dynamic whitelist
CREATE OR REPLACE FUNCTION public.can_run_auto_sync(p_user_id uuid, p_module text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now_brt    timestamp;
  v_hour       int;
  v_dow        int;
  v_last_login timestamptz;
  v_paused     boolean;
  v_enabled    boolean;
  v_h_start    int;
  v_h_end      int;
  v_h_sat_end  int;
  v_allowed    jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_user');
  END IF;

  -- Kill switch global: se desativado, libera tudo (volta ao comportamento legado)
  v_enabled := COALESCE((public._economy_setting('economy_mode.enabled','true'::jsonb))::text::boolean, true);
  IF NOT v_enabled THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'economy_mode_disabled');
  END IF;

  SELECT last_login_at, COALESCE(auto_sync_paused,false)
    INTO v_last_login, v_paused
    FROM public.profiles WHERE user_id = p_user_id LIMIT 1;

  IF v_paused THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'user_paused');
  END IF;

  -- Inatividade ≥ 3 dias sem login
  IF v_last_login IS NULL OR v_last_login < now() - interval '3 days' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'inactive_user');
  END IF;

  -- Whitelist dinâmica
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

  -- Domingo: bloqueado
  IF v_dow = 0 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'sunday_blocked');
  END IF;

  -- Sábado: 07:00 até saturday_end_hour
  IF v_dow = 6 THEN
    IF v_hour < v_h_start OR v_hour >= v_h_sat_end THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'saturday_economy');
    END IF;
    RETURN jsonb_build_object('allowed', true, 'reason', 'ok');
  END IF;

  -- Seg–Sex: janela padrão
  IF v_hour < v_h_start OR v_hour >= v_h_end THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'outside_hours');
  END IF;

  RETURN jsonb_build_object('allowed', true, 'reason', 'ok');
END;
$$;

-- 4) Gate p/ crons SQL (pg_cron) — usado por wrappers de net.http_post
CREATE OR REPLACE FUNCTION public.cron_gate_allows(p_module text DEFAULT 'cron')
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now_brt   timestamp;
  v_hour      int;
  v_dow       int;
  v_enabled   boolean;
  v_gate_on   boolean;
  v_h_start   int;
  v_h_end     int;
  v_h_sat_end int;
BEGIN
  v_enabled := COALESCE((public._economy_setting('economy_mode.enabled','true'::jsonb))::text::boolean, true);
  v_gate_on := COALESCE((public._economy_setting('economy_mode.cron_gate_enabled','true'::jsonb))::text::boolean, true);
  IF NOT v_enabled OR NOT v_gate_on THEN
    RETURN true; -- kill switch: libera
  END IF;

  v_now_brt := (now() AT TIME ZONE 'America/Sao_Paulo');
  v_hour    := EXTRACT(HOUR FROM v_now_brt)::int;
  v_dow     := EXTRACT(DOW  FROM v_now_brt)::int;

  v_h_start   := COALESCE((public._economy_setting('economy_mode.window_start_hour','7'::jsonb))::text::int, 7);
  v_h_end     := COALESCE((public._economy_setting('economy_mode.window_end_hour','19'::jsonb))::text::int, 19);
  v_h_sat_end := COALESCE((public._economy_setting('economy_mode.saturday_end_hour','12'::jsonb))::text::int, 12);

  IF v_dow = 0 THEN
    RETURN false;
  END IF;
  IF v_dow = 6 THEN
    RETURN v_hour >= v_h_start AND v_hour < v_h_sat_end;
  END IF;
  RETURN v_hour >= v_h_start AND v_hour < v_h_end;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_run_auto_sync(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cron_gate_allows(text)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._economy_setting(text,jsonb) TO authenticated, service_role;
