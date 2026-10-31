-- 1.4: labeltest_complete_batch deixa de devolver o array batches
DROP FUNCTION IF EXISTS public.labeltest_complete_batch(uuid, integer, jsonb, integer, jsonb);

CREATE FUNCTION public.labeltest_complete_batch(p_job_id uuid, p_batch_index integer, p_batch_patch jsonb, p_success_count integer, p_log_entries jsonb)
 RETURNS TABLE(all_done boolean, processed integer, total_labels integer, job_started_at timestamp with time zone, layout text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_batches jsonb;
  v_processed int;
  v_log jsonb;
  v_lock_key bigint;
  v_current_batch jsonb;
  v_current_status text;
BEGIN
  v_lock_key := ('x' || substr(md5(p_job_id::text), 1, 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT q.batches, COALESCE(q.processed_labels, 0), COALESCE(q.per_shipment_log, '[]'::jsonb)
    INTO v_batches, v_processed, v_log
  FROM public.meli_print_queue_v2 q WHERE q.id = p_job_id FOR UPDATE;

  IF v_batches IS NULL THEN
    RAISE EXCEPTION 'job not found: %', p_job_id;
  END IF;

  v_current_batch := v_batches->p_batch_index;
  v_current_status := COALESCE(v_current_batch->>'status', 'pending');

  IF v_current_status IN ('success', 'error') THEN
    RETURN QUERY
    SELECT
      (SELECT bool_and((b->>'status') IN ('success','error')) FROM jsonb_array_elements(v_batches) b),
      v_processed, q.total_labels, q.job_started_at, q.layout
    FROM public.meli_print_queue_v2 q WHERE q.id = p_job_id;
    RETURN;
  END IF;

  v_batches := jsonb_set(v_batches, ARRAY[p_batch_index::text], v_current_batch || p_batch_patch, false);

  v_processed := v_processed + COALESCE(p_success_count, 0);
  IF p_log_entries IS NOT NULL AND jsonb_typeof(p_log_entries) = 'array' THEN
    v_log := v_log || p_log_entries;
  END IF;

  UPDATE public.meli_print_queue_v2 q
     SET batches = v_batches, processed_labels = v_processed, per_shipment_log = v_log
   WHERE q.id = p_job_id;

  RETURN QUERY
  SELECT
    (SELECT bool_and((b->>'status') IN ('success','error')) FROM jsonb_array_elements(v_batches) b),
    v_processed, q.total_labels, q.job_started_at, q.layout
  FROM public.meli_print_queue_v2 q WHERE q.id = p_job_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.labeltest_complete_batch(uuid, integer, jsonb, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.labeltest_complete_batch(uuid, integer, jsonb, integer, jsonb) TO service_role;

-- 1.1: status leve calculado no banco (sem transmitir batches / PDFs / log)
CREATE OR REPLACE FUNCTION public.labels_v2_job_status(p_job_id uuid, p_user_id uuid)
 RETURNS TABLE(
   job_id uuid, status text, format text, layout text,
   total_labels integer, processed_labels integer,
   total_batches integer, completed_batches integer, error_batches integer, processing_batches integer,
   job_started_at timestamptz, job_completed_at timestamptz,
   success_count integer, errors jsonb,
   download_filename text, page_width_mm numeric, page_height_mm numeric,
   total_pages integer, error_log text, has_file boolean
 )
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    q.id, q.status, q.format, q.layout,
    q.total_labels, q.processed_labels,
    COALESCE(b.total, 0), COALESCE(b.completed, 0), COALESCE(b.errored, 0), COALESCE(b.processing, 0),
    q.job_started_at, q.job_completed_at,
    COALESCE(l.ok_count, 0), COALESCE(l.errs, '[]'::jsonb),
    q.download_filename, q.page_width_mm, q.page_height_mm,
    q.total_pages, q.error_log,
    (q.file_url IS NOT NULL OR q.pdf_base64 IS NOT NULL OR q.zpl_content IS NOT NULL)
  FROM public.meli_print_queue_v2 q
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE e->>'status' IN ('success','completed'))::int AS completed,
           count(*) FILTER (WHERE e->>'status' = 'error')::int AS errored,
           count(*) FILTER (WHERE e->>'status' IN ('processing','retrying'))::int AS processing
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(q.batches) = 'array' THEN q.batches ELSE '[]'::jsonb END) e
  ) b ON true
  LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE e->>'status' = 'ok')::int AS ok_count,
           COALESCE(jsonb_agg(jsonb_build_object(
             'shipment_id', e->>'shipment_id',
             'reason_code', COALESCE(e->>'reason_code', 'UNKNOWN'),
             'reason_message', COALESCE(e->>'error', e->>'reason_message', 'Erro desconhecido')
           )) FILTER (WHERE e->>'status' = 'error'), '[]'::jsonb) AS errs
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(q.per_shipment_log) = 'array' THEN q.per_shipment_log ELSE '[]'::jsonb END) e
  ) l ON true
  WHERE q.id = p_job_id AND q.user_id = p_user_id;
$function$;

REVOKE ALL ON FUNCTION public.labels_v2_job_status(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.labels_v2_job_status(uuid, uuid) TO service_role;

-- 1.5: cleanup também encerra jobs travados em 'processando' há mais de 24h
CREATE OR REPLACE FUNCTION public.cleanup_print_payloads(p_hours integer DEFAULT 24, p_limit integer DEFAULT 200)
 RETURNS TABLE(cleaned_rows integer, freed_estimate_bytes bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rows int := 0;
  v_bytes bigint := 0;
BEGIN
  UPDATE public.meli_print_queue_v2
     SET status = 'erro',
         error_log = COALESCE(NULLIF(error_log, '') || ' | ', '') || 'Job travado em processamento por mais de 24h — encerrado automaticamente pela limpeza.',
         job_completed_at = COALESCE(job_completed_at, now()),
         updated_at = now()
   WHERE status = 'processando'
     AND created_at < now() - interval '24 hours';

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

-- 2.1: dono do job lê o próprio arquivo (caminho começa com o user_id)
CREATE POLICY "print_labels_owner_read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'print-labels' AND (storage.foldername(name))[1] = auth.uid()::text);