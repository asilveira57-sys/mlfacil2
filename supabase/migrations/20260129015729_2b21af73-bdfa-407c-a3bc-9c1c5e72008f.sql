-- Add seller listing reference fields to competitor_trackers table
-- This allows linking a competitor to the user's own listing for price comparison

ALTER TABLE public.competitor_trackers 
ADD COLUMN IF NOT EXISTS seller_listing_ref_type text,
ADD COLUMN IF NOT EXISTS seller_listing_ref_id uuid,
ADD COLUMN IF NOT EXISTS seller_listing_title text,
ADD COLUMN IF NOT EXISTS seller_listing_sku text,
ADD COLUMN IF NOT EXISTS seller_listing_price numeric,
ADD COLUMN IF NOT EXISTS follow_price_up boolean DEFAULT false;

-- Add index for quick lookup of linked trackers
CREATE INDEX IF NOT EXISTS idx_trackers_seller_listing ON public.competitor_trackers(seller_listing_ref_id) WHERE seller_listing_ref_id IS NOT NULL;

-- Add status field to competitor_price_actions to track workflow
ALTER TABLE public.competitor_price_actions
ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';

-- Add index for pending actions lookup
CREATE INDEX IF NOT EXISTS idx_price_actions_status ON public.competitor_price_actions(status, user_id) WHERE status = 'pending';

COMMENT ON COLUMN public.competitor_trackers.seller_listing_ref_type IS 'Type of seller listing table: meli_listings_cache';
COMMENT ON COLUMN public.competitor_trackers.seller_listing_ref_id IS 'UUID reference to the seller listing record';
COMMENT ON COLUMN public.competitor_trackers.seller_listing_title IS 'Cached title for quick display';
COMMENT ON COLUMN public.competitor_trackers.seller_listing_sku IS 'Cached SKU for quick display';
COMMENT ON COLUMN public.competitor_trackers.seller_listing_price IS 'Cached current price for quick comparison';
COMMENT ON COLUMN public.competitor_trackers.follow_price_up IS 'Whether to also follow price increases from competitor';
COMMENT ON COLUMN public.competitor_price_actions.status IS 'Workflow status: pending, done, ignored';