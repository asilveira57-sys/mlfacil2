-- 1. Ensure a dedicated cron key exists in vault for billing reconciliation
DO $$
DECLARE
  v_existing uuid;
BEGIN
  SELECT id INTO v_existing FROM vault.secrets WHERE name = 'billing_cron_key';
  IF v_existing IS NULL THEN
    PERFORM vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'billing_cron_key',
      'Shared secret used by pg_cron to call billing-reconcile-payments'
    );
  END IF;
END $$;

-- 2. Security-definer accessor so edge functions (service role) can read the key
CREATE OR REPLACE FUNCTION public.get_billing_cron_key()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'billing_cron_key' LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_billing_cron_key() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_billing_cron_key() TO service_role;

-- 3. Re-schedule the billing reconciliation cron with the new key
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'billing-reconcile-payments-5min' LIMIT 1;
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END $$;

SELECT cron.schedule(
  'billing-reconcile-payments-5min',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/billing-reconcile-payments',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'billing_cron_key')
    ),
    body := '{"since_days":2,"source":"cron"}'::jsonb,
    timeout_milliseconds := 60000
  ) AS request_id;
  $cron$
);