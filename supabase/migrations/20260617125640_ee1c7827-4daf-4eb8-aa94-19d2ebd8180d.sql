
-- 1. Tabela login_events (append-only)
CREATE TABLE IF NOT EXISTS public.login_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  source text NOT NULL DEFAULT 'web',
  session_fingerprint text
);

GRANT SELECT, INSERT ON public.login_events TO authenticated;
GRANT ALL ON public.login_events TO service_role;

ALTER TABLE public.login_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own login events"
  ON public.login_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users insert own login events"
  ON public.login_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_login_events_user_created ON public.login_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_events_created ON public.login_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_events_day_brt ON public.login_events(((created_at AT TIME ZONE 'America/Sao_Paulo')::date));

-- 2. Atualiza touch_user_activity para gravar evento de login (com kill-switch via dynamic_feature_flags)
CREATE OR REPLACE FUNCTION public.touch_user_activity(p_user_id uuid, p_is_login boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tracking_enabled boolean;
BEGIN
  IF p_is_login THEN
    UPDATE public.profiles
       SET last_login_at = now(), last_active_at = now()
     WHERE user_id = p_user_id;

    -- Kill-switch: feature flag global (workspace_id IS NULL)
    SELECT COALESCE(is_enabled, true) INTO v_tracking_enabled
      FROM public.dynamic_feature_flags
     WHERE feature_key = 'login_tracking_enabled' AND workspace_id IS NULL
     LIMIT 1;

    IF v_tracking_enabled IS NULL OR v_tracking_enabled = true THEN
      INSERT INTO public.login_events (user_id, source)
      VALUES (p_user_id, 'web');
    END IF;
  ELSE
    UPDATE public.profiles
       SET last_active_at = now()
     WHERE user_id = p_user_id;
  END IF;
END;
$function$;

-- 3. View de contagem diária
CREATE OR REPLACE VIEW public.login_daily_counts AS
SELECT
  (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
  COUNT(DISTINCT user_id) AS contas_unicas,
  COUNT(*) AS total_eventos
FROM public.login_events
GROUP BY 1
ORDER BY 1 DESC;

GRANT SELECT ON public.login_daily_counts TO authenticated;
GRANT ALL ON public.login_daily_counts TO service_role;

-- 4. Backfill mínimo a partir de security_events
INSERT INTO public.login_events (user_id, created_at, user_agent, source)
SELECT user_id, created_at, user_agent, 'backfill_security_events'
FROM public.security_events
WHERE event_type = 'login' AND success = true
  AND NOT EXISTS (
    SELECT 1 FROM public.login_events le
    WHERE le.user_id = security_events.user_id
      AND le.created_at = security_events.created_at
  );

-- 5. Insere flag de kill-switch (default ligado)
INSERT INTO public.dynamic_feature_flags (workspace_id, feature_key, is_enabled)
VALUES (NULL, 'login_tracking_enabled', true)
ON CONFLICT DO NOTHING;
