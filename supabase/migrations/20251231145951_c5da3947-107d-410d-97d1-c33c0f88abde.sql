-- Adicionar campo thumbnail para fotos dos produtos
ALTER TABLE meli_order_items_cache
ADD COLUMN IF NOT EXISTS thumbnail text;