
-- =====================================================
-- Phase 1 — Cost Containment Helpers
-- Helper functions to safely compact webhook backlog and
-- clean heavy payloads from print queue without touching
-- operational flows.
-- =====================================================

-- 1) Compact pending webhook backlog in batches
-- Marks pending events whose topic is in the discard list as 'ignored'.
-- Returns the count of affected rows. Safe to re-run.
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
     SET status = 'ignored',
         processed_at = now(),
         last_error = 'cost_containment_discarded_topic'
    FROM victims v
   WHERE w.id = v.id;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected;
END;
$$;

-- 2) Compact pending duplicates per (ml_user_id, topic, resource)
-- Keeps only the most recent pending event per group, marks the rest as 'ignored'.
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
     SET status = 'ignored',
         processed_at = now(),
         last_error = 'cost_containment_superseded_by_newer'
    FROM victims v
   WHERE w.id = v.id;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected;
END;
$$;

-- 3) Clean heavy payloads from print queue (does NOT delete the row).
-- Strips pdf_base64 / zpl_content / per_shipment_log / batches when the
-- job is in a terminal state (concluido/erro/parcial) and older than N hours.
-- Metadata (status, datas, totals, file_url, download_filename) is preserved.
CREATE OR REPLACE FUNCTION public.cleanup_print_payloads(
  p_hours int DEFAULT 24,
  p_limit int DEFAULT 200
) RETURNS TABLE(cleaned_rows int, freed_estimate_bytes bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows int := 0;
  v_bytes bigint := 0;
BEGIN
  WITH victims AS (
    SELECT id,
           coalesce(octet_length(pdf_base64), 0)
         + coalesce(octet_length(zpl_content), 0)
         + coalesce(octet_length(batches::text), 0)
         + coalesce(octet_length(per_shipment_log::text), 0) AS bytes_freed
    FROM public.meli_print_queue_v2
    WHERE created_at < now() - make_interval(hours => GREATEST(p_hours, 1))
      AND status IN ('concluido','erro','parcial')
      AND (pdf_base64 IS NOT NULL OR zpl_content IS NOT NULL OR batches IS NOT NULL OR per_shipment_log IS NOT NULL)
    ORDER BY created_at ASC
    LIMIT GREATEST(p_limit, 1)
  ),
  upd AS (
    UPDATE public.meli_print_queue_v2 q
       SET pdf_base64 = NULL,
           zpl_content = NULL,
           batches = NULL,
           per_shipment_log = NULL,
           updated_at = now()
      FROM victims v
     WHERE q.id = v.id
    RETURNING v.bytes_freed
  )
  SELECT count(*)::int, coalesce(sum(bytes_freed),0)::bigint
    INTO v_rows, v_bytes
    FROM upd;

  RETURN QUERY SELECT v_rows, v_bytes;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compact_webhook_backlog_discard(text[], int) TO service_role;
GRANT EXECUTE ON FUNCTION public.compact_webhook_backlog_duplicates(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_print_payloads(int, int) TO service_role;
