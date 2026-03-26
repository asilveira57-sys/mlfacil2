
-- 1. Change target_seller_id from UUID to TEXT (ML seller IDs are strings like "66043362")
ALTER TABLE public.mktpfacil_announcements 
  ALTER COLUMN target_seller_id TYPE TEXT USING target_seller_id::TEXT;

-- 2. Add index for filtering by target_seller_id
CREATE INDEX IF NOT EXISTS idx_announcements_target_seller 
  ON public.mktpfacil_announcements(target_seller_id) 
  WHERE target_seller_id IS NOT NULL;

-- 3. Add published_at default so robot announcements always have it
ALTER TABLE public.mktpfacil_announcements 
  ALTER COLUMN published_at SET DEFAULT now();
