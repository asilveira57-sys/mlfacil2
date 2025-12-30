-- Add columns to meli_print_queue for batch processing and queue support
ALTER TABLE public.meli_print_queue 
ADD COLUMN IF NOT EXISTS total_labels INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS processed_labels INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS batches JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS job_started_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS job_completed_at TIMESTAMP WITH TIME ZONE;

-- Add index for efficient status polling
CREATE INDEX IF NOT EXISTS idx_meli_print_queue_status_user 
ON public.meli_print_queue(user_id, status, created_at DESC);

-- Add comment explaining the batches structure
COMMENT ON COLUMN public.meli_print_queue.batches IS 'Array of batch objects: [{batch_id, shipment_ids, status, retry_count, file_path, error_message}]';