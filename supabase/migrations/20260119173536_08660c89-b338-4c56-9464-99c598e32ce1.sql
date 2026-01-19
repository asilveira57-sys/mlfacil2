-- 1) Adicionar campos de subcategoria na tabela public_categories
ALTER TABLE public.public_categories
ADD COLUMN IF NOT EXISTS parent_id text REFERENCES public.public_categories(id),
ADD COLUMN IF NOT EXISTS depth int DEFAULT 0,
ADD COLUMN IF NOT EXISTS path text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS children_count int DEFAULT 0,
ADD COLUMN IF NOT EXISTS collect_subcategories boolean DEFAULT false;

-- 2) Criar índices para navegação eficiente
CREATE INDEX IF NOT EXISTS idx_public_categories_parent_id ON public.public_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_public_categories_path ON public.public_categories USING GIN(path);

-- 3) Adicionar tabela para cache de subcategorias descobertas
CREATE TABLE IF NOT EXISTS public.category_tree_cache (
  id text PRIMARY KEY,
  parent_id text,
  name text NOT NULL,
  path text[] DEFAULT '{}',
  depth int DEFAULT 0,
  children_count int DEFAULT 0,
  total_items_qty int DEFAULT 0,
  fetched_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_category_tree_cache_parent ON public.category_tree_cache(parent_id);
CREATE INDEX IF NOT EXISTS idx_category_tree_cache_path ON public.category_tree_cache USING GIN(path);

-- 4) Permitir leitura pública de categorias (público, sem RLS restritivo)
ALTER TABLE public.public_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read public_categories" ON public.public_categories;
CREATE POLICY "Anyone can read public_categories" 
ON public.public_categories FOR SELECT 
USING (true);

ALTER TABLE public.category_tree_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read category_tree_cache" ON public.category_tree_cache;
CREATE POLICY "Anyone can read category_tree_cache" 
ON public.category_tree_cache FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Service role can manage category_tree_cache" ON public.category_tree_cache;
CREATE POLICY "Service role can manage category_tree_cache"
ON public.category_tree_cache FOR ALL
USING (true);

-- 5) Adicionar campo estimated_revenue no highlights_items
ALTER TABLE public.highlights_items
ADD COLUMN IF NOT EXISTS estimated_revenue numeric DEFAULT 0;

-- 6) Criar tabela para métricas pessoais do seller por categoria
CREATE TABLE IF NOT EXISTS public.seller_category_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  seller_id text NOT NULL,
  category_id text NOT NULL,
  period_key text NOT NULL, -- e.g. '2025-01' or 'last_30d'
  quantity_sold int DEFAULT 0,
  revenue numeric DEFAULT 0,
  avg_ticket numeric DEFAULT 0,
  margin_percent numeric DEFAULT 0,
  items_count int DEFAULT 0,
  orders_count int DEFAULT 0,
  calculated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(seller_id, category_id, period_key)
);

CREATE INDEX IF NOT EXISTS idx_seller_category_metrics_seller ON public.seller_category_metrics(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_category_metrics_category ON public.seller_category_metrics(category_id);

ALTER TABLE public.seller_category_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own seller_category_metrics" ON public.seller_category_metrics;
CREATE POLICY "Users can read their own seller_category_metrics"
ON public.seller_category_metrics FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage seller_category_metrics" ON public.seller_category_metrics;
CREATE POLICY "Service role can manage seller_category_metrics"
ON public.seller_category_metrics FOR ALL
USING (true);

-- 7) Atualizar categorias principais para habilitar coleta de subcategorias
UPDATE public.public_categories 
SET collect_subcategories = true, depth = 0, path = ARRAY[id]
WHERE parent_id IS NULL AND id != '__ROOT__';

-- 8) Adicionar campo de status no public_trends_status para subcategorias
ALTER TABLE public.public_trends_status
ADD COLUMN IF NOT EXISTS subcategories_collected int DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_subcategory_sync_at timestamptz;