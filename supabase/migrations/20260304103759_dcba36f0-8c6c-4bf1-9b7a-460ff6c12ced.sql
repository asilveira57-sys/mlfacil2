
-- Add 'retry' to email_queue_status enum
ALTER TYPE public.email_queue_status ADD VALUE IF NOT EXISTS 'retry' AFTER 'failed';

-- Index for worker processing
CREATE INDEX IF NOT EXISTS idx_email_queue_status_priority 
  ON public.email_queue (status, priority DESC, created_at ASC) 
  WHERE status = 'queued';
