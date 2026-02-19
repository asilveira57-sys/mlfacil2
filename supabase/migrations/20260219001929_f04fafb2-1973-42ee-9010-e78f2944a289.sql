
-- Add status column to system_modules
ALTER TABLE public.system_modules 
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Set Concorrência as coming_soon
UPDATE public.system_modules 
  SET status = 'coming_soon' 
  WHERE id = 'b0000000-0000-0000-0000-000000000053';
