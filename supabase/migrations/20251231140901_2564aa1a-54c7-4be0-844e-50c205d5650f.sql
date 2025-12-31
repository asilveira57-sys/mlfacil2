-- Remover constraint antiga que não inclui variation_id
ALTER TABLE meli_order_items_cache 
DROP CONSTRAINT IF EXISTS meli_order_items_cache_seller_id_order_id_item_id_key;

-- Atualizar valores NULL de variation_id para string vazia para consistência
UPDATE meli_order_items_cache 
SET variation_id = '' 
WHERE variation_id IS NULL;

-- Criar nova constraint única com 4 colunas incluindo variation_id
ALTER TABLE meli_order_items_cache 
ADD CONSTRAINT meli_order_items_cache_unique_product 
UNIQUE (seller_id, order_id, item_id, variation_id);