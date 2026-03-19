
-- Add published_at and expires_at columns to mktpfacil_announcements
ALTER TABLE public.mktpfacil_announcements 
  ADD COLUMN IF NOT EXISTS published_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NULL;

-- Backfill existing announcements: published_at = created_at
UPDATE public.mktpfacil_announcements 
SET published_at = created_at 
WHERE published_at != created_at OR published_at IS NULL;
