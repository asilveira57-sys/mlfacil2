SELECT cron.schedule(
  'shipping-status-sync-30min',
  '*/30 10-19 * * 1-6',
  $$SELECT CASE WHEN public.cron_gate_allows('shipping_full') THEN
      net.http_post(
        url:='https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/shipping-status-sync',
        headers:='{"Content-Type": "application/json", "x-cron-key": "default-cron-secret"}'::jsonb,
        body:='{}'::jsonb
      ) END AS request_id;$$
);
SELECT cron.schedule(
  'shipping-labels-sync-30min',
  '*/30 10-19 * * 1-6',
  $$SELECT CASE WHEN public.cron_gate_allows('shipping_labels') THEN
      net.http_post(
        url:='https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/shipping-labels-sync',
        headers:='{"Content-Type": "application/json", "x-cron-key": "default-cron-secret"}'::jsonb,
        body:='{"mode": "incremental"}'::jsonb
      ) END AS request_id;$$
);
SELECT cron.schedule(
  'ml-sync-messages-window',
  '*/15 10-19 * * 1-6',
  $$SELECT CASE WHEN public.cron_gate_allows('messages') THEN
      net.http_post(
        url:='https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/ml-sync-messages',
        headers:='{"Content-Type": "application/json", "x-cron-key": "default-cron-secret"}'::jsonb,
        body:='{}'::jsonb
      ) END AS request_id;$$
);
SELECT cron.schedule(
  'qa-messages-polling-window',
  '*/15 10-19 * * 1-6',
  $$SELECT CASE WHEN public.cron_gate_allows('qa') THEN
      net.http_post(
        url:='https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/ml-sync-questions',
        headers:='{"Content-Type": "application/json", "x-cron-key": "default-cron-secret"}'::jsonb,
        body:='{}'::jsonb
      ) END AS request_id;$$
);