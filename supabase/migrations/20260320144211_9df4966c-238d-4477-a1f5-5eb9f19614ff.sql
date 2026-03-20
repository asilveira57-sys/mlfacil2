-- Add sales enrichment columns to listing_health_current
ALTER TABLE listing_health_current
  ADD COLUMN IF NOT EXISTS sales_count_7d integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS units_sold_7d integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sales_count_30d integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS units_sold_30d integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conversion_rate_7d numeric(6,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS days_without_sale integer,
  ADD COLUMN IF NOT EXISTS last_sale_at timestamptz;

-- Add sales enrichment columns to listing_health_history
ALTER TABLE listing_health_history
  ADD COLUMN IF NOT EXISTS sales_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS units_sold integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS days_without_sale integer,
  ADD COLUMN IF NOT EXISTS last_sale_at timestamptz;

-- Index for faster sales lookups in order items
CREATE INDEX IF NOT EXISTS idx_meli_order_items_seller_item 
  ON meli_order_items_cache (seller_id, item_id);

CREATE INDEX IF NOT EXISTS idx_meli_order_items_seller_created 
  ON meli_order_items_cache (seller_id, created_at_meli DESC);

-- Index for listing_health_current sales queries
CREATE INDEX IF NOT EXISTS idx_lhc_seller_days_without_sale 
  ON listing_health_current (seller_id, days_without_sale DESC NULLS LAST);