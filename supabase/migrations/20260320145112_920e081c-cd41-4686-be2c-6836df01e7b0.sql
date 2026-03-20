
-- Add change detection and structured alerts columns to listing_health_current
ALTER TABLE listing_health_current
  ADD COLUMN IF NOT EXISTS change_flags jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS alerts_json jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS prev_price numeric,
  ADD COLUMN IF NOT EXISTS prev_visits integer,
  ADD COLUMN IF NOT EXISTS prev_available_quantity integer,
  ADD COLUMN IF NOT EXISTS prev_listing_status text,
  ADD COLUMN IF NOT EXISTS prev_shipping_mode text,
  ADD COLUMN IF NOT EXISTS prev_catalog_listing boolean;
