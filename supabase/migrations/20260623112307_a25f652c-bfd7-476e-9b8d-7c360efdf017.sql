
-- 1) Composite index for print queue lookups
CREATE INDEX IF NOT EXISTS idx_meli_print_queue_v2_user_id
  ON public.meli_print_queue_v2 (user_id, id DESC);

-- 2) Safe cleanup: pending > 24h and NOT in the operational whitelist
CREATE OR REPLACE FUNCTION public.cleanup_webhook_events_v7(dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  critical_topics text[] := ARRAY['shipments','messages','questions','orders_v2'];
  candidate_count bigint;
  candidate_size bigint;
  deleted_count bigint := 0;
BEGIN
  SELECT count(*), COALESCE(sum(pg_column_size(payload_raw)),0)
    INTO candidate_count, candidate_size
  FROM public.webhook_events
  WHERE status = 'pending'
    AND received_at < now() - interval '24 hours'
    AND NOT (topic = ANY (critical_topics));

  IF NOT dry_run THEN
    WITH d AS (
      DELETE FROM public.webhook_events
      WHERE status = 'pending'
        AND received_at < now() - interval '24 hours'
        AND NOT (topic = ANY (critical_topics))
      RETURNING 1
    )
    SELECT count(*) INTO deleted_count FROM d;
  END IF;

  RETURN jsonb_build_object(
    'dry_run', dry_run,
    'candidates', candidate_count,
    'candidate_payload_bytes', candidate_size,
    'deleted', deleted_count,
    'protected_topics', to_jsonb(critical_topics),
    'cutoff', (now() - interval '24 hours')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_webhook_events_v7(boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_webhook_events_v7(boolean) TO service_role;

-- 3) Health report for ongoing audit
CREATE OR REPLACE FUNCTION public.webhook_events_health_report()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  by_topic jsonb;
  totals jsonb;
  size_total text;
  size_table text;
  pending_total bigint;
BEGIN
  SELECT jsonb_agg(t)
    INTO by_topic
  FROM (
    SELECT topic, status, count(*) AS qty
    FROM public.webhook_events
    WHERE received_at > now() - interval '24 hours'
    GROUP BY topic, status
    ORDER BY count(*) DESC
  ) t;

  SELECT jsonb_build_object(
    'received_24h', count(*) FILTER (WHERE received_at > now() - interval '24 hours'),
    'pending_total', count(*) FILTER (WHERE status = 'pending'),
    'error_24h', count(*) FILTER (WHERE status = 'error' AND received_at > now() - interval '24 hours'),
    'done_24h', count(*) FILTER (WHERE status = 'done' AND received_at > now() - interval '24 hours')
  ) INTO totals
  FROM public.webhook_events;

  size_total := pg_size_pretty(pg_total_relation_size('public.webhook_events'));
  size_table := pg_size_pretty(pg_relation_size('public.webhook_events'));
  pending_total := (totals->>'pending_total')::bigint;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'totals', totals,
    'by_topic_24h', COALESCE(by_topic, '[]'::jsonb),
    'size_total', size_total,
    'size_table_only', size_table,
    'alerts', jsonb_build_object(
      'pending_over_20k', pending_total > 20000,
      'received_over_10k_24h', (totals->>'received_24h')::bigint > 10000
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.webhook_events_health_report() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.webhook_events_health_report() TO service_role;
