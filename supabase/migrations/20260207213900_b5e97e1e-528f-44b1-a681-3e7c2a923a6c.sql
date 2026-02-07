
-- Add new columns to promotion_items_snapshots for richer API data capture
ALTER TABLE public.promotion_items_snapshots
  ADD COLUMN IF NOT EXISTS effective_price NUMERIC,
  ADD COLUMN IF NOT EXISTS net_proceeds_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS net_proceeds_currency TEXT,
  ADD COLUMN IF NOT EXISTS suggested_price NUMERIC,
  ADD COLUMN IF NOT EXISTS max_discounted_price NUMERIC,
  ADD COLUMN IF NOT EXISTS min_discounted_price NUMERIC,
  ADD COLUMN IF NOT EXISTS raw_item_data JSONB;

-- Add comment for documentation
COMMENT ON COLUMN public.promotion_items_snapshots.effective_price IS 'Effective promotional price from API field "price" (populated even for BANK-type promotions)';
COMMENT ON COLUMN public.promotion_items_snapshots.net_proceeds_amount IS 'Net amount seller receives after ML commission (from API field net_proceeds.amount)';
COMMENT ON COLUMN public.promotion_items_snapshots.net_proceeds_currency IS 'Currency of net_proceeds (e.g. BRL)';
COMMENT ON COLUMN public.promotion_items_snapshots.suggested_price IS 'ML suggested discounted price';
COMMENT ON COLUMN public.promotion_items_snapshots.max_discounted_price IS 'Maximum allowed discounted price';
COMMENT ON COLUMN public.promotion_items_snapshots.min_discounted_price IS 'Minimum allowed discounted price';
COMMENT ON COLUMN public.promotion_items_snapshots.raw_item_data IS 'Full raw JSON from ML API response for this item';
