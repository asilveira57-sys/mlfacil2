CREATE OR REPLACE FUNCTION public.labeltest_complete_batch(
  p_job_id uuid,
  p_batch_index int,
  p_batch_patch jsonb,
  p_success_count int,
  p_log_entries jsonb
)
RETURNS TABLE(all_done boolean, batches jsonb, processed_labels int, total_labels int, job_started_at timestamptz, layout text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batches jsonb;
  v_processed int;
  v_log jsonb;
  v_lock_key bigint;
  v_current_batch jsonb;
  v_current_status text;
BEGIN
  -- Lock por job (advisory transactional). Converte uuid em bigint estável.
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

  -- Idempotência: retries concorrentes/tardios não podem somar o mesmo lote de novo.
  IF v_current_status IN ('success', 'error') THEN
    RETURN QUERY
    SELECT
      (SELECT bool_and((b->>'status') IN ('success','error')) FROM jsonb_array_elements(v_batches) b) AS all_done,
      v_batches,
      v_processed,
      q.total_labels,
      q.job_started_at,
      q.layout
    FROM public.meli_print_queue_v2 q WHERE q.id = p_job_id;
    RETURN;
  END IF;

  -- Substitui o batch[idx] pelo patch enviado (merge raso)
  v_batches := jsonb_set(
    v_batches,
    ARRAY[p_batch_index::text],
    v_current_batch || p_batch_patch,
    false
  );

  v_processed := v_processed + COALESCE(p_success_count, 0);
  IF p_log_entries IS NOT NULL AND jsonb_typeof(p_log_entries) = 'array' THEN
    v_log := v_log || p_log_entries;
  END IF;

  UPDATE public.meli_print_queue_v2 q
     SET batches = v_batches,
         processed_labels = v_processed,
         per_shipment_log = v_log
   WHERE q.id = p_job_id;

  RETURN QUERY
  SELECT
    (SELECT bool_and((b->>'status') IN ('success','error')) FROM jsonb_array_elements(v_batches) b) AS all_done,
    v_batches,
    v_processed,
    q.total_labels,
    q.job_started_at,
    q.layout
  FROM public.meli_print_queue_v2 q WHERE q.id = p_job_id;
END;
$$;