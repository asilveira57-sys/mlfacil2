DROP INDEX IF EXISTS public.idx_webhook_events_status;
CREATE INDEX IF NOT EXISTS idx_webhook_events_pending_received ON public.webhook_events (received_at) WHERE status = 'pending';