
-- cost_daily_report
CREATE TABLE IF NOT EXISTS public.cost_daily_report (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date date NOT NULL UNIQUE,
  webhooks_received bigint NOT NULL DEFAULT 0,
  webhooks_discarded bigint NOT NULL DEFAULT 0,
  webhooks_processed bigint NOT NULL DEFAULT 0,
  webhooks_pending bigint NOT NULL DEFAULT 0,
  webhook_events_size_mb numeric NOT NULL DEFAULT 0,
  print_queue_size_mb numeric NOT NULL DEFAULT 0,
  orders_cache_size_mb numeric NOT NULL DEFAULT 0,
  sellers_active bigint NOT NULL DEFAULT 0,
  sellers_inactive_suspended bigint NOT NULL DEFAULT 0,
  jobs_executed bigint NOT NULL DEFAULT 0,
  jobs_blocked_by_hours bigint NOT NULL DEFAULT 0,
  jobs_blocked_by_inactivity bigint NOT NULL DEFAULT 0,
  storage_freed_mb numeric NOT NULL DEFAULT 0,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cost_daily_report TO authenticated;
GRANT ALL    ON public.cost_daily_report TO service_role;
ALTER TABLE public.cost_daily_report ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view cost_daily_report"
  ON public.cost_daily_report FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- cost_alerts
CREATE TABLE IF NOT EXISTS public.cost_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'warn',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cost_alerts_kind_created ON public.cost_alerts (kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_alerts_unresolved   ON public.cost_alerts (created_at DESC) WHERE NOT resolved;

GRANT SELECT, UPDATE ON public.cost_alerts TO authenticated;
GRANT ALL            ON public.cost_alerts TO service_role;
ALTER TABLE public.cost_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view cost_alerts"
  ON public.cost_alerts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update cost_alerts"
  ON public.cost_alerts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- raise_cost_alert helper (silenced when killswitch on)
INSERT INTO public.platform_settings (key, value)
VALUES ('economy_mode.alerts_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.raise_cost_alert(
  p_kind text,
  p_severity text DEFAULT 'warn',
  p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_enabled boolean;
BEGIN
  v_enabled := COALESCE((public._economy_setting('economy_mode.alerts_enabled','true'::jsonb))::text::boolean, true);
  IF NOT v_enabled THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.cost_alerts (kind, severity, payload)
  VALUES (p_kind, p_severity, COALESCE(p_payload,'{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.raise_cost_alert(text,text,jsonb) TO authenticated, service_role;
