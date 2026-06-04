
-- Função utilitária de retenção (idempotente)
CREATE OR REPLACE FUNCTION public.run_cost_retention_cleanup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- webhook_events: processados há mais de 7 dias
  DELETE FROM public.webhook_events
  WHERE processed_at IS NOT NULL AND processed_at < now() - interval '7 days';

  -- webhook_events: pendentes há mais de 3 dias (já foram superados por eventos mais novos do mesmo recurso)
  DELETE FROM public.webhook_events
  WHERE status = 'pending' AND received_at < now() - interval '3 days';

  -- cron history
  DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days';

  -- print queue v2
  DELETE FROM public.meli_print_queue_v2 WHERE created_at < now() - interval '30 days';

  -- cutoff logs
  DELETE FROM public.shipping_cutoff_logs WHERE created_at < now() - interval '30 days';
END;
$$;

-- Agendar diariamente às 03:00 UTC (00:00 BRT) — só se ainda não existe
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cost-retention-daily') THEN
    PERFORM cron.schedule(
      'cost-retention-daily',
      '0 3 * * *',
      $cron$SELECT public.run_cost_retention_cleanup();$cron$
    );
  END IF;
END;
$$;
