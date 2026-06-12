
CREATE OR REPLACE FUNCTION public.compact_webhook_backlog_discard(
  p_topics text[] DEFAULT ARRAY['items','messages','questions','invoices'],
  p_limit int DEFAULT 5000
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_affected int := 0;
BEGIN
  WITH victims AS (
    SELECT id
    FROM public.webhook_events
    WHERE status = 'pending'
      AND topic = ANY(p_topics)
    ORDER BY received_at ASC
    LIMIT GREATEST(p_limit, 1)
  )
  UPDATE public.webhook_events w
     SET status = 'skipped',
         processed_at = now(),
         last_error = 'cost_containment_discarded_topic'
    FROM victims v
   WHERE w.id = v.id;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected;
END;
$$;

CREATE OR REPLACE FUNCTION public.compact_webhook_backlog_duplicates(
  p_limit int DEFAULT 5000
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_affected int := 0;
BEGIN
  WITH ranked AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY ml_user_id, topic, resource
             ORDER BY received_at DESC
           ) AS rn
    FROM public.webhook_events
    WHERE status = 'pending'
  ),
  victims AS (
    SELECT id FROM ranked WHERE rn > 1
    LIMIT GREATEST(p_limit, 1)
  )
  UPDATE public.webhook_events w
     SET status = 'skipped',
         processed_at = now(),
         last_error = 'cost_containment_superseded_by_newer'
    FROM victims v
   WHERE w.id = v.id;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected;
END;
$$;
