
-- =============================================
-- FASE 5: email_analytics_daily + aggregation
-- =============================================

CREATE TABLE public.email_analytics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_queued INTEGER NOT NULL DEFAULT 0,
  total_sent INTEGER NOT NULL DEFAULT 0,
  total_failed INTEGER NOT NULL DEFAULT 0,
  total_retried INTEGER NOT NULL DEFAULT 0,
  total_cancelled INTEGER NOT NULL DEFAULT 0,
  total_events INTEGER NOT NULL DEFAULT 0,
  total_schedules INTEGER NOT NULL DEFAULT 0,
  total_campaigns INTEGER NOT NULL DEFAULT 0,
  avg_send_time_ms INTEGER DEFAULT 0,
  top_template_id UUID REFERENCES public.email_templates(id),
  top_event_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (metric_date)
);

ALTER TABLE public.email_analytics_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_email_analytics" ON public.email_analytics_daily
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Function to aggregate daily analytics from email_logs
CREATE OR REPLACE FUNCTION public.aggregate_email_analytics(p_date DATE DEFAULT CURRENT_DATE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_queued INTEGER;
  v_sent INTEGER;
  v_failed INTEGER;
  v_retried INTEGER;
  v_cancelled INTEGER;
  v_events INTEGER;
  v_schedules INTEGER;
  v_campaigns INTEGER;
  v_top_template UUID;
  v_top_event TEXT;
BEGIN
  -- Count by action from email_logs
  SELECT
    COUNT(*) FILTER (WHERE action = 'enqueue'),
    COUNT(*) FILTER (WHERE action = 'sent'),
    COUNT(*) FILTER (WHERE action = 'fail'),
    COUNT(*) FILTER (WHERE action IN ('dedup_block', 'throttle_block')),
    COUNT(*) FILTER (WHERE action = 'cancel'),
    COUNT(*) FILTER (WHERE source_type = 'event'),
    COUNT(*) FILTER (WHERE source_type = 'schedule'),
    COUNT(*) FILTER (WHERE source_type = 'campaign')
  INTO v_queued, v_sent, v_failed, v_retried, v_cancelled, v_events, v_schedules, v_campaigns
  FROM public.email_logs
  WHERE created_at::date = p_date;

  -- Top template
  SELECT template_id INTO v_top_template
  FROM public.email_logs
  WHERE created_at::date = p_date AND template_id IS NOT NULL
  GROUP BY template_id
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  -- Top event
  SELECT event_key INTO v_top_event
  FROM public.email_logs
  WHERE created_at::date = p_date AND event_key IS NOT NULL
  GROUP BY event_key
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  INSERT INTO public.email_analytics_daily (
    metric_date, total_queued, total_sent, total_failed, total_retried,
    total_cancelled, total_events, total_schedules, total_campaigns,
    top_template_id, top_event_key
  ) VALUES (
    p_date, v_queued, v_sent, v_failed, v_retried,
    v_cancelled, v_events, v_schedules, v_campaigns,
    v_top_template, v_top_event
  )
  ON CONFLICT (metric_date) DO UPDATE SET
    total_queued = EXCLUDED.total_queued,
    total_sent = EXCLUDED.total_sent,
    total_failed = EXCLUDED.total_failed,
    total_retried = EXCLUDED.total_retried,
    total_cancelled = EXCLUDED.total_cancelled,
    total_events = EXCLUDED.total_events,
    total_schedules = EXCLUDED.total_schedules,
    total_campaigns = EXCLUDED.total_campaigns,
    top_template_id = EXCLUDED.top_template_id,
    top_event_key = EXCLUDED.top_event_key,
    updated_at = now();
END;
$$;
