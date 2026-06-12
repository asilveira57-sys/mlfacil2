
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
       SET pdf_base64 = NULL,
           zpl_content = NULL,
           batches = '[]'::jsonb,
           per_shipment_log = '[]'::jsonb,
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
