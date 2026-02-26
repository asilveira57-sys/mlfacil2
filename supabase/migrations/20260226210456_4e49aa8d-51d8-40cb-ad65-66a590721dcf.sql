
-- Add target_seller_id column to mktpfacil_announcements
ALTER TABLE public.mktpfacil_announcements
ADD COLUMN target_seller_id UUID NULL;

-- Create index for filtering
CREATE INDEX idx_mktpfacil_announcements_target_seller 
ON public.mktpfacil_announcements (target_seller_id);
