CREATE OR REPLACE FUNCTION public.labeltest_mark_stale_batches(p_job_id uuid, p_stale_seconds integer DEFAULT 60)
RETURNS integer[] LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_lock_key bigint; v_batches jsonb; v_job_started timestamptz; v_status text;
  v_out jsonb := '[]'::jsonb; v_idx int[] := '{}'; b jsonb; i int := 0; v_ref timestamptz;
BEGIN
  v_lock_key := ('x' || substr(md5(p_job_id::text), 1, 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);
  SELECT q.batches, q.job_started_at, q.status INTO v_batches, v_job_started, v_status
    FROM public.meli_print_queue_v2 q WHERE q.id = p_job_id FOR UPDATE;
  IF v_batches IS NULL OR v_status <> 'processando' OR jsonb_typeof(v_batches) <> 'array' THEN RETURN v_idx; END IF;
  FOR b IN SELECT value FROM jsonb_array_elements(v_batches) LOOP
    IF COALESCE(b->>'status','pending') NOT IN ('success','error') THEN
      v_ref := COALESCE((b->>'recovery_dispatched_at')::timestamptz, (b->>'started_at')::timestamptz, v_job_started, now());
      IF now() - v_ref > make_interval(secs => GREATEST(p_stale_seconds, 1)) THEN
        b := b || jsonb_build_object('status','retrying','recovery_dispatched_at', now());
        v_idx := v_idx || COALESCE((b->>'idx')::int, i);
      END IF;
    END IF;
    v_out := v_out || jsonb_build_array(b); i := i + 1;
  END LOOP;
  IF array_length(v_idx, 1) > 0 THEN
    UPDATE public.meli_print_queue_v2 SET batches = v_out WHERE id = p_job_id;
  END IF;
  RETURN v_idx;
END; $$;
REVOKE ALL ON FUNCTION public.labeltest_mark_stale_batches(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.labeltest_mark_stale_batches(uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_print_payloads(p_hours integer DEFAULT 24, p_limit integer DEFAULT 200)
 RETURNS TABLE(cleaned_rows integer, freed_estimate_bytes bigint)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_rows int := 0;
  v_bytes bigint := 0;
BEGIN
  UPDATE public.meli_print_queue_v2
     SET status = 'erro',
         error_log = COALESCE(NULLIF(error_log, '') || ' | ', '') || 'Job sem progresso por mais de 24h — encerrado automaticamente pela limpeza.',
         job_completed_at = COALESCE(job_completed_at, now()),
         updated_at = now()
   WHERE status = 'processando'
     AND updated_at < now() - interval '24 hours';

  WITH victims AS (
    SELECT id,
           coalesce(octet_length(pdf_base64), 0)
         + coalesce(octet_length(zpl_content), 0)
         + coalesce(octet_length(batches::text), 0)
         + coalesce(octet_length(per_shipment_log::text), 0) AS bytes_freed
    FROM public.meli_print_queue_v2
    WHERE created_at < now() - make_interval(hours => GREATEST(p_hours, 1))
      AND status IN ('concluido','erro','parcial')
      AND (
        pdf_base64 IS NOT NULL
        OR zpl_content IS NOT NULL
        OR (batches IS NOT NULL AND batches::text <> '[]')
        OR (per_shipment_log IS NOT NULL AND per_shipment_log::text <> '[]')
      )
    ORDER BY created_at ASC
    LIMIT GREATEST(p_limit, 1)
  ),
  upd AS (
    UPDATE public.meli_print_queue_v2 q
       SET pdf_base64 = NULL, zpl_content = NULL,
           batches = '[]'::jsonb, per_shipment_log = '[]'::jsonb,
           updated_at = now()
      FROM victims v
     WHERE q.id = v.id
    RETURNING v.bytes_freed
  )
  SELECT count(*)::int, coalesce(sum(bytes_freed),0)::bigint INTO v_rows, v_bytes FROM upd;

  RETURN QUERY SELECT v_rows, v_bytes;
END;
$function$;