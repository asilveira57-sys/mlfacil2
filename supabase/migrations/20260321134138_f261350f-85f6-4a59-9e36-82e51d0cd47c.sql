ALTER TABLE public.listing_health_current
ADD COLUMN IF NOT EXISTS is_ads_active boolean DEFAULT null,
ADD COLUMN IF NOT EXISTS ads_status text DEFAULT null,
ADD COLUMN IF NOT EXISTS is_promotion_active boolean DEFAULT null,
ADD COLUMN IF NOT EXISTS promotion_status text DEFAULT null;