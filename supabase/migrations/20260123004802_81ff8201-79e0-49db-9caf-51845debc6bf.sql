-- Add unique constraint to prevent future duplicates in meli_listings_cache
ALTER TABLE meli_listings_cache
ADD CONSTRAINT meli_listings_cache_seller_item_unique 
UNIQUE (seller_id, item_id);