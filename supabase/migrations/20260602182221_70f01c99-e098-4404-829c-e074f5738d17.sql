
-- 1. Update can_run_auto_sync: window 07:00–17:00 BRT
CREATE OR REPLACE FUNCTION public.can_run_auto_sync(p_user_id uuid, p_module text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_now_brt timestamp;
  v_hour int;
  v_dow int;
  v_last_login timestamptz;
  v_paused boolean;
  v_paused_modules text[] := ARRAY[
    'ad_timeline','radiografia','promotions','ads','seed',
    'abc','custos','frete','ajuste_preco','atacado','trends','mercado'
  ];
  v_allowed_modules text[] := ARRAY['shipping_labels','shipping_full'];
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_user');
  END IF;

  SELECT last_login_at, COALESCE(auto_sync_paused,false)
    INTO v_last_login, v_paused
    FROM public.profiles WHERE user_id = p_user_id LIMIT 1;

  IF v_paused THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'user_paused');
  END IF;

  -- 3 dias sem login -> inativo
  IF v_last_login IS NULL OR v_last_login < now() - interval '3 days' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'inactive_user');
  END IF;

  -- módulo pausado (somente sob demanda)
  IF p_module = ANY(v_paused_modules) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'paused_module');
  END IF;

  -- somente shipping é elegível para auto-sync
  IF NOT (p_module = ANY(v_allowed_modules)) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'module_not_whitelisted');
  END IF;

  -- janela horária BRT: 07:00–17:00 (17h inclusive bloqueado)
  v_now_brt := (now() AT TIME ZONE 'America/Sao_Paulo');
  v_hour := EXTRACT(HOUR FROM v_now_brt)::int;
  v_dow  := EXTRACT(DOW  FROM v_now_brt)::int;

  IF v_hour < 7 OR v_hour >= 17 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'outside_hours');
  END IF;

  -- domingo bloqueado
  IF v_dow = 0 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'weekend');
  END IF;

  RETURN jsonb_build_object('allowed', true, 'reason', 'ok');
END;
$function$;

-- 2. Index para filtrar sellers ativos rapidamente
CREATE INDEX IF NOT EXISTS idx_profiles_last_login_at ON public.profiles(last_login_at);

-- 3. Função para resetar locks travados
CREATE OR REPLACE FUNCTION public.reset_stale_sync_locks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
BEGIN
  WITH updated AS (
    UPDATE public.sync_scheduler
       SET status = 'idle',
           last_run_at = COALESCE(last_run_at, now())
     WHERE status = 'running'
       AND last_run_at < now() - interval '20 minutes'
    RETURNING job_name
  )
  SELECT count(*) INTO v_count FROM updated;

  RETURN jsonb_build_object('reset_count', v_count, 'ran_at', now());
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reset_stale_sync_locks() TO service_role;

-- 4. Reagendar cron jobs (todos limitados a 07–17h BRT = 10–20h UTC, seg–sáb)
DO $$
BEGIN
  -- Remove jobs antigos de shipping (intervalos diferentes do desejado)
  PERFORM cron.unschedule('shipping-status-sync-mon');
  PERFORM cron.unschedule('shipping-status-sync-tue-fri');
  PERFORM cron.unschedule('shipping-status-sync-sat');
  PERFORM cron.unschedule('shipping-labels-sync-morning');
  PERFORM cron.unschedule('shipping-labels-sync-incremental');

  -- Remove jobs noturnos/fora da janela
  PERFORM cron.unschedule('orders-nightly-sync');

  -- Remove jobs de orders/messages/qa (vão ser recriados na janela 07–17h)
  PERFORM cron.unschedule('orders-hourly-sync-mon');
  PERFORM cron.unschedule('orders-hourly-sync-tue-fri');
  PERFORM cron.unschedule('orders-hourly-sync-sat');
  PERFORM cron.unschedule('ml-sync-messages-worker-mon');
  PERFORM cron.unschedule('ml-sync-messages-worker-tue-fri');
  PERFORM cron.unschedule('ml-sync-messages-worker-sat');
  PERFORM cron.unschedule('qa-messages-polling-mon');
  PERFORM cron.unschedule('qa-messages-polling-tue-fri');
  PERFORM cron.unschedule('qa-messages-polling-sat');
EXCEPTION WHEN OTHERS THEN
  -- ignore: jobs may not exist
  NULL;
END $$;

-- Shipping status sync: a cada 30 min, 10–19 UTC (07–16:59 BRT), seg–sáb
SELECT cron.schedule(
  'shipping-status-sync-30min',
  '*/30 10-19 * * 1-6',
  $$SELECT net.http_post(
      url:='https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/shipping-status-sync',
      headers:='{"Content-Type": "application/json", "x-cron-key": "default-cron-secret"}'::jsonb,
      body:='{}'::jsonb
    ) AS request_id;$$
);

-- Shipping labels sync: a cada 30 min, 10–19 UTC, seg–sáb (incremental)
SELECT cron.schedule(
  'shipping-labels-sync-30min',
  '*/30 10-19 * * 1-6',
  $$SELECT net.http_post(
      url:='https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/shipping-labels-sync',
      headers:='{"Content-Type": "application/json", "x-cron-key": "default-cron-secret"}'::jsonb,
      body:='{"mode": "incremental"}'::jsonb
    ) AS request_id;$$
);

-- Orders hourly sync: 1x/h, 10–19 UTC, seg–sáb
SELECT cron.schedule(
  'orders-hourly-sync-window',
  '0 10-19 * * 1-6',
  $$SELECT net.http_post(
      url:='https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/orders-hourly-sync',
      headers:='{"Content-Type": "application/json", "x-cron-key": "default-cron-secret"}'::jsonb,
      body:='{}'::jsonb
    ) AS request_id;$$
);

-- Mensagens ML: a cada 15 min, 10–19 UTC, seg–sáb
SELECT cron.schedule(
  'ml-sync-messages-window',
  '*/15 10-19 * * 1-6',
  $$SELECT net.http_post(
      url:='https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/ml-sync-messages',
      headers:='{"Content-Type": "application/json", "x-cron-key": "default-cron-secret"}'::jsonb,
      body:='{}'::jsonb
    ) AS request_id;$$
);

-- QA messages: a cada 15 min, 10–19 UTC, seg–sáb
SELECT cron.schedule(
  'qa-messages-polling-window',
  '*/15 10-19 * * 1-6',
  $$SELECT net.http_post(
      url:='https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/ml-sync-questions',
      headers:='{"Content-Type": "application/json", "x-cron-key": "default-cron-secret"}'::jsonb,
      body:='{}'::jsonb
    ) AS request_id;$$
);

-- Reset stale locks: a cada 10 min
SELECT cron.schedule(
  'reset-stale-sync-locks',
  '*/10 * * * *',
  $$SELECT public.reset_stale_sync_locks();$$
);
