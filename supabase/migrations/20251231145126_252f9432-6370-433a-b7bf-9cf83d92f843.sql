-- Adicionar campos para links corretos de produtos
ALTER TABLE meli_order_items_cache
ADD COLUMN IF NOT EXISTS permalink text,
ADD COLUMN IF NOT EXISTS catalog_product_id text;