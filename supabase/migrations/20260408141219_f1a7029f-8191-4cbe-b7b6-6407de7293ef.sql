-- Fix CHECK constraint to include rate_limited
ALTER TABLE public.email_send_log DROP CONSTRAINT IF EXISTS email_send_log_status_check;
ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_status_check
  CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq', 'rate_limited'));

-- Disable legacy email-worker-send cron that returns 401 constantly
SELECT cron.unschedule('email-worker-send-every-5min');

-- Mark stale queued emails in legacy email_queue as expired
UPDATE public.email_queue 
SET status = 'failed', 
    error = 'Legacy system disabled - migrated to Lovable Cloud email infrastructure',
    updated_at = now()
WHERE status = 'queued';