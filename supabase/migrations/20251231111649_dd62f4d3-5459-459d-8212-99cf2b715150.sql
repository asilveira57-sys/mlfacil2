-- Tabela para armazenar itens dos pedidos (necessário para Curva ABC e Top Produtos)
CREATE TABLE meli_order_items_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  title TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  created_at_meli TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(seller_id, order_id, item_id)
);

-- Enable RLS
ALTER TABLE meli_order_items_cache ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY "meli_order_items_cache_all" ON meli_order_items_cache
  FOR ALL USING (auth.uid() = user_id);

-- Indexes para performance
CREATE INDEX idx_meli_order_items_seller ON meli_order_items_cache(seller_id);
CREATE INDEX idx_meli_order_items_item ON meli_order_items_cache(item_id);
CREATE INDEX idx_meli_order_items_date ON meli_order_items_cache(created_at_meli);
CREATE INDEX idx_meli_order_items_user ON meli_order_items_cache(user_id);