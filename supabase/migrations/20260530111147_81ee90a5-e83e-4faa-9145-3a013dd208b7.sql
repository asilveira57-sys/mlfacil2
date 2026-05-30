DO $$ BEGIN
  PERFORM cron.unschedule('global-metrics-daily-refresh');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  PERFORM cron.unschedule('global-metrics-monthly-snapshot');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule('global-metrics-daily-refresh', '30 9 * * *', $job$
  SELECT net.http_post(
    url:='https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/global-metrics-refresh',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmY2tyYnF3ZHNlamljamx4cWR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMjMzMDQsImV4cCI6MjA4MjU5OTMwNH0.borKJKXIRf66qyHrsqpwOF7L_5afCHyzVhISCUtkneg"}'::jsonb,
    body:='{"mode": "incremental", "requested_by": "cron-daily"}'::jsonb
  ) AS request_id;
$job$);

SELECT cron.schedule('global-metrics-monthly-snapshot', '0 5 1 * *', $job$
  SELECT net.http_post(
    url:='https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/global-metrics-refresh',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmY2tyYnF3ZHNlamljamx4cWR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMjMzMDQsImV4cCI6MjA4MjU5OTMwNH0.borKJKXIRf66qyHrsqpwOF7L_5afCHyzVhISCUtkneg"}'::jsonb,
    body:='{"mode": "snapshot", "requested_by": "cron-monthly"}'::jsonb
  ) AS request_id;
$job$);

SELECT net.http_post(
  url:='https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/global-metrics-refresh',
  headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmY2tyYnF3ZHNlamljamx4cWR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMjMzMDQsImV4cCI6MjA4MjU5OTMwNH0.borKJKXIRf66qyHrsqpwOF7L_5afCHyzVhISCUtkneg"}'::jsonb,
  body:='{"mode": "full", "requested_by": "migration-reactivate"}'::jsonb
);