
-- Add tag column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tag text DEFAULT null;

-- Create user_import_logs table
CREATE TABLE IF NOT EXISTS public.user_import_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text,
  status text NOT NULL CHECK (status IN ('created', 'updated', 'skipped', 'error')),
  reason text,
  batch_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.user_import_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read import logs
CREATE POLICY "admin_read_import_logs" ON public.user_import_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
