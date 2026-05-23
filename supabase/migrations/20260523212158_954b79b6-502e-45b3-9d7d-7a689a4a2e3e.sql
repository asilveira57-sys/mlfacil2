
-- ============================================================
-- Modo Fim de Semana
-- Janela inativa: Sáb 13:00 BRT -> Seg 05:00 BRT
--                 (Sáb 16:00 UTC -> Seg 08:00 UTC)
-- pg_cron exige um schedule por job -> dividimos em 3 jobs:
--   *-mon       : segunda a partir das 05h BRT
--   *-tue-fri   : terça a sexta dia todo
--   *-sat       : sábado até 12h BRT
-- ============================================================

-- Remove os jobs originais
SELECT cron.unschedule('orders-hourly-sync');
SELECT cron.unschedule('shipping-status-sync-optimized');
SELECT cron.unschedule('ml-sync-messages-worker');
SELECT cron.unschedule('qa-messages-polling-day');
SELECT cron.unschedule('trends-collect-seller-daytime');
SELECT cron.unschedule('trends-alerts-engine-daytime');

-- ---------- 1. orders-hourly-sync (era: 30 * * * *) ----------
SELECT cron.schedule('orders-hourly-sync-mon', '30 8-23 * * 1', $$
  SELECT net.http_post(
    url:='https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/orders-hourly-sync',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmY2tyYnF3ZHNlamljamx4cWR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMjMzMDQsImV4cCI6MjA4MjU5OTMwNH0.borKJKXIRf66qyHrsqpwOF7L_5afCHyzVhISCUtkneg"}'::jsonb,
    body:='{}'::jsonb) AS request_id;
$$);
SELECT cron.schedule('orders-hourly-sync-tue-fri', '30 * * * 2-5', $$
  SELECT net.http_post(
    url:='https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/orders-hourly-sync',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmY2tyYnF3ZHNlamljamx4cWR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMjMzMDQsImV4cCI6MjA4MjU5OTMwNH0.borKJKXIRf66qyHrsqpwOF7L_5afCHyzVhISCUtkneg"}'::jsonb,
    body:='{}'::jsonb) AS request_id;
$$);
SELECT cron.schedule('orders-hourly-sync-sat', '30 0-15 * * 6', $$
  SELECT net.http_post(
    url:='https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/orders-hourly-sync',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmY2tyYnF3ZHNlamljamx4cWR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMjMzMDQsImV4cCI6MjA4MjU5OTMwNH0.borKJKXIRf66qyHrsqpwOF7L_5afCHyzVhISCUtkneg"}'::jsonb,
    body:='{}'::jsonb) AS request_id;
$$);

-- ---------- 2. shipping-status-sync-optimized (era: */15 7-22 * * *) ----------
SELECT cron.schedule('shipping-status-sync-mon', '*/15 8-22 * * 1', $$
  SELECT net.http_post(
    url:='https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/shipping-status-sync',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmY2tyYnF3ZHNlamljamx4cWR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMjMzMDQsImV4cCI6MjA4MjU5OTMwNH0.borKJKXIRf66qyHrsqpwOF7L_5afCHyzVhISCUtkneg"}'::jsonb,
    body:='{}'::jsonb) AS request_id;
$$);
SELECT cron.schedule('shipping-status-sync-tue-fri', '*/15 7-22 * * 2-5', $$
  SELECT net.http_post(
    url:='https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/shipping-status-sync',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmY2tyYnF3ZHNlamljamx4cWR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMjMzMDQsImV4cCI6MjA4MjU5OTMwNH0.borKJKXIRf66qyHrsqpwOF7L_5afCHyzVhISCUtkneg"}'::jsonb,
    body:='{}'::jsonb) AS request_id;
$$);
SELECT cron.schedule('shipping-status-sync-sat', '*/15 7-15 * * 6', $$
  SELECT net.http_post(
    url:='https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/shipping-status-sync',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmY2tyYnF3ZHNlamljamx4cWR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMjMzMDQsImV4cCI6MjA4MjU5OTMwNH0.borKJKXIRf66qyHrsqpwOF7L_5afCHyzVhISCUtkneg"}'::jsonb,
    body:='{}'::jsonb) AS request_id;
$$);

-- ---------- 3. ml-sync-messages-worker (era: */15 7-22 * * *) ----------
SELECT cron.schedule('ml-sync-messages-worker-mon', '*/15 8-22 * * 1', $$
  SELECT net.http_post(
    url := 'https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/ml-worker-process',
    headers := '{"Content-Type": "application/json", "x-cron-key": "default-cron-secret"}'::jsonb,
    body := '{}'::jsonb) AS request_id;
$$);
SELECT cron.schedule('ml-sync-messages-worker-tue-fri', '*/15 7-22 * * 2-5', $$
  SELECT net.http_post(
    url := 'https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/ml-worker-process',
    headers := '{"Content-Type": "application/json", "x-cron-key": "default-cron-secret"}'::jsonb,
    body := '{}'::jsonb) AS request_id;
$$);
SELECT cron.schedule('ml-sync-messages-worker-sat', '*/15 7-15 * * 6', $$
  SELECT net.http_post(
    url := 'https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/ml-worker-process',
    headers := '{"Content-Type": "application/json", "x-cron-key": "default-cron-secret"}'::jsonb,
    body := '{}'::jsonb) AS request_id;
$$);

-- ---------- 4. qa-messages-polling-day (era: */12 7-22 * * *) ----------
SELECT cron.schedule('qa-messages-polling-mon', '*/12 8-22 * * 1', $$
  SELECT net.http_post(
    url:='https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/qa-messages-polling-sync',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmY2tyYnF3ZHNlamljamx4cWR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMjMzMDQsImV4cCI6MjA4MjU5OTMwNH0.borKJKXIRf66qyHrsqpwOF7L_5afCHyzVhISCUtkneg"}'::jsonb,
    body:='{}'::jsonb) AS request_id;
$$);
SELECT cron.schedule('qa-messages-polling-tue-fri', '*/12 7-22 * * 2-5', $$
  SELECT net.http_post(
    url:='https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/qa-messages-polling-sync',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmY2tyYnF3ZHNlamljamx4cWR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMjMzMDQsImV4cCI6MjA4MjU5OTMwNH0.borKJKXIRf66qyHrsqpwOF7L_5afCHyzVhISCUtkneg"}'::jsonb,
    body:='{}'::jsonb) AS request_id;
$$);
SELECT cron.schedule('qa-messages-polling-sat', '*/12 7-15 * * 6', $$
  SELECT net.http_post(
    url:='https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/qa-messages-polling-sync',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmY2tyYnF3ZHNlamljamx4cWR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMjMzMDQsImV4cCI6MjA4MjU5OTMwNH0.borKJKXIRf66qyHrsqpwOF7L_5afCHyzVhISCUtkneg"}'::jsonb,
    body:='{}'::jsonb) AS request_id;
$$);

-- ---------- 5. trends-collect-seller-daytime (era: 15 7-22 * * *) ----------
SELECT cron.schedule('trends-collect-seller-mon', '15 8-22 * * 1', $$
  SELECT net.http_post(
    url:='https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/trends-collect-seller',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmY2tyYnF3ZHNlamljamx4cWR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMjMzMDQsImV4cCI6MjA4MjU5OTMwNH0.borKJKXIRf66qyHrsqpwOF7L_5afCHyzVhISCUtkneg"}'::jsonb,
    body:='{}'::jsonb) AS request_id;
$$);
SELECT cron.schedule('trends-collect-seller-tue-fri', '15 7-22 * * 2-5', $$
  SELECT net.http_post(
    url:='https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/trends-collect-seller',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmY2tyYnF3ZHNlamljamx4cWR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMjMzMDQsImV4cCI6MjA4MjU5OTMwNH0.borKJKXIRf66qyHrsqpwOF7L_5afCHyzVhISCUtkneg"}'::jsonb,
    body:='{}'::jsonb) AS request_id;
$$);
SELECT cron.schedule('trends-collect-seller-sat', '15 7-15 * * 6', $$
  SELECT net.http_post(
    url:='https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/trends-collect-seller',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmY2tyYnF3ZHNlamljamx4cWR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMjMzMDQsImV4cCI6MjA4MjU5OTMwNH0.borKJKXIRf66qyHrsqpwOF7L_5afCHyzVhISCUtkneg"}'::jsonb,
    body:='{}'::jsonb) AS request_id;
$$);

-- ---------- 6. trends-alerts-engine-daytime (era: 30 8-22 * * *) ----------
SELECT cron.schedule('trends-alerts-engine-mon-fri', '30 8-22 * * 1-5', $$
  SELECT net.http_post(
    url:='https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/trends-alerts-engine',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmY2tyYnF3ZHNlamljamx4cWR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMjMzMDQsImV4cCI6MjA4MjU5OTMwNH0.borKJKXIRf66qyHrsqpwOF7L_5afCHyzVhISCUtkneg"}'::jsonb,
    body:='{}'::jsonb) AS request_id;
$$);
SELECT cron.schedule('trends-alerts-engine-sat', '30 8-15 * * 6', $$
  SELECT net.http_post(
    url:='https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/trends-alerts-engine',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmY2tyYnF3ZHNlamljamx4cWR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMjMzMDQsImV4cCI6MjA4MjU5OTMwNH0.borKJKXIRf66qyHrsqpwOF7L_5afCHyzVhISCUtkneg"}'::jsonb,
    body:='{}'::jsonb) AS request_id;
$$);
