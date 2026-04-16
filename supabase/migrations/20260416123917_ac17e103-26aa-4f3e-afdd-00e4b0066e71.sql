-- Add module column to meli_print_queue_v2 for labeltest isolation
ALTER TABLE public.meli_print_queue_v2 
ADD COLUMN IF NOT EXISTS module text DEFAULT 'v2';

-- Index for filtering by module
CREATE INDEX IF NOT EXISTS idx_meli_print_queue_v2_module 
ON public.meli_print_queue_v2 (module);
