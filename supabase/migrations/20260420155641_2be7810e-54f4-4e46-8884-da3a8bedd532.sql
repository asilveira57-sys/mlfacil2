
UPDATE public.meli_print_queue_v2
   SET status = 'erro',
       per_shipment_log = COALESCE(per_shipment_log, '[]'::jsonb) || '[{"shipment_id":"system","status":"error","error":"Job auto-cancelado: race condition corrigida. Tente novamente."}]'::jsonb,
       job_completed_at = now()
 WHERE status = 'processando'
   AND created_at < now() - interval '5 minutes';
