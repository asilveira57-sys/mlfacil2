-- =====================================================
-- 1. ADICIONAR COLUNAS EM meli_orders_cache
-- =====================================================
ALTER TABLE public.meli_orders_cache 
ADD COLUMN IF NOT EXISTS buyer_name text NULL,
ADD COLUMN IF NOT EXISTS order_comment text NULL,
ADD COLUMN IF NOT EXISTS items_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS items_synced_at timestamptz NULL;

-- Índices para meli_orders_cache
CREATE INDEX IF NOT EXISTS idx_meli_orders_cache_seller_created 
  ON public.meli_orders_cache (seller_id, created_at_meli DESC);
CREATE INDEX IF NOT EXISTS idx_meli_orders_cache_seller_status 
  ON public.meli_orders_cache (seller_id, order_status);
CREATE INDEX IF NOT EXISTS idx_meli_orders_cache_seller_shipment 
  ON public.meli_orders_cache (seller_id, shipment_id);

-- =====================================================
-- 2. ADICIONAR COLUNAS EM meli_order_items_cache
-- =====================================================
ALTER TABLE public.meli_order_items_cache 
ADD COLUMN IF NOT EXISTS shipment_id text NULL,
ADD COLUMN IF NOT EXISTS variation_id text NULL,
ADD COLUMN IF NOT EXISTS sku text NULL,
ADD COLUMN IF NOT EXISTS title_short text NULL,
ADD COLUMN IF NOT EXISTS currency_id text NULL,
ADD COLUMN IF NOT EXISTS product_key text NOT NULL DEFAULT '';

-- Índices para meli_order_items_cache
CREATE INDEX IF NOT EXISTS idx_meli_order_items_seller_order 
  ON public.meli_order_items_cache (seller_id, order_id);
CREATE INDEX IF NOT EXISTS idx_meli_order_items_seller_item 
  ON public.meli_order_items_cache (seller_id, item_id);
CREATE INDEX IF NOT EXISTS idx_meli_order_items_seller_product_key 
  ON public.meli_order_items_cache (seller_id, product_key);
CREATE INDEX IF NOT EXISTS idx_meli_order_items_seller_created 
  ON public.meli_order_items_cache (seller_id, created_at_meli DESC);

-- Unique constraint para evitar duplicação de item+variação no mesmo pedido
-- DROP a constraint existente se houver
ALTER TABLE public.meli_order_items_cache 
DROP CONSTRAINT IF EXISTS meli_order_items_cache_unique_item_variation;

-- Criar nova constraint
ALTER TABLE public.meli_order_items_cache 
ADD CONSTRAINT meli_order_items_cache_unique_item_variation 
  UNIQUE (seller_id, order_id, item_id, variation_id);

-- =====================================================
-- 3. CRIAR TABELA product_cost_catalog
-- =====================================================
CREATE TABLE IF NOT EXISTS public.product_cost_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  seller_id text NOT NULL,
  product_key text NOT NULL,
  display_name text NULL,
  cost_value numeric NOT NULL DEFAULT 0,
  cost_currency text NOT NULL DEFAULT 'BRL',
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Constraint única
ALTER TABLE public.product_cost_catalog 
DROP CONSTRAINT IF EXISTS product_cost_catalog_unique_seller_product;
ALTER TABLE public.product_cost_catalog 
ADD CONSTRAINT product_cost_catalog_unique_seller_product 
  UNIQUE (seller_id, product_key);

-- Índices
CREATE INDEX IF NOT EXISTS idx_product_cost_catalog_seller_updated 
  ON public.product_cost_catalog (seller_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_cost_catalog_seller_product 
  ON public.product_cost_catalog (seller_id, product_key);

-- RLS
ALTER TABLE public.product_cost_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_cost_catalog_all" 
ON public.product_cost_catalog 
FOR ALL 
USING (auth.uid() = user_id);

-- =====================================================
-- 4. CRIAR RPC get_sales_metrics (PERFORMANCE)
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_sales_metrics(p_seller_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := CURRENT_DATE;
  v_7d_ago date := CURRENT_DATE - INTERVAL '7 days';
  v_30d_ago date := CURRENT_DATE - INTERVAL '30 days';
  v_result jsonb;
  v_daily_series jsonb;
BEGIN
  -- Calcular métricas agregadas de uma vez
  WITH metrics AS (
    SELECT
      -- Hoje
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date = v_today THEN 1 ELSE 0 END), 0) as orders_today,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date = v_today THEN total_amount ELSE 0 END), 0) as revenue_today,
      -- 7 dias
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date >= v_7d_ago THEN 1 ELSE 0 END), 0) as orders_7d,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date >= v_7d_ago THEN total_amount ELSE 0 END), 0) as revenue_7d,
      -- 30 dias
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date >= v_30d_ago THEN 1 ELSE 0 END), 0) as orders_30d,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date >= v_30d_ago THEN total_amount ELSE 0 END), 0) as revenue_30d,
      -- Total
      COUNT(*) as orders_total,
      COALESCE(SUM(total_amount), 0) as revenue_total,
      -- Contadores de sync
      COUNT(*) FILTER (WHERE items_synced_at IS NOT NULL) as orders_with_items_synced
    FROM public.meli_orders_cache
    WHERE seller_id = p_seller_id
      AND order_status = 'paid'
  ),
  -- Série diária dos últimos 30 dias
  date_series AS (
    SELECT generate_series(v_30d_ago, v_today, '1 day'::interval)::date as dt
  ),
  daily_agg AS (
    SELECT 
      (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date as dt,
      COUNT(*) as orders,
      COALESCE(SUM(total_amount), 0) as revenue
    FROM public.meli_orders_cache
    WHERE seller_id = p_seller_id
      AND order_status = 'paid'
      AND (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date >= v_30d_ago
    GROUP BY 1
  ),
  daily_filled AS (
    SELECT 
      ds.dt::text as date,
      COALESCE(da.orders, 0) as orders,
      COALESCE(da.revenue, 0) as revenue
    FROM date_series ds
    LEFT JOIN daily_agg da ON ds.dt = da.dt
    ORDER BY ds.dt
  ),
  -- Top produtos 30 dias
  top_products AS (
    SELECT 
      i.product_key as id,
      COALESCE(i.title, i.item_id) as title,
      SUM(i.quantity) as quantity,
      SUM(i.quantity * i.unit_price) as revenue
    FROM public.meli_order_items_cache i
    INNER JOIN public.meli_orders_cache o 
      ON o.seller_id = i.seller_id AND o.order_id = i.order_id
    WHERE i.seller_id = p_seller_id
      AND o.order_status = 'paid'
      AND (o.created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date >= v_30d_ago
    GROUP BY i.product_key, i.title, i.item_id
    ORDER BY revenue DESC
    LIMIT 10
  ),
  -- Contagem de itens no cache
  items_count AS (
    SELECT COUNT(*) as total_items
    FROM public.meli_order_items_cache
    WHERE seller_id = p_seller_id
  )
  SELECT jsonb_build_object(
    'ordersToday', m.orders_today,
    'revenueToday', m.revenue_today,
    'orders7d', m.orders_7d,
    'revenue7d', m.revenue_7d,
    'orders30d', m.orders_30d,
    'revenue30d', m.revenue_30d,
    'ordersTotal', m.orders_total,
    'revenueTotal', m.revenue_total,
    'averageTicket', CASE WHEN m.orders_total > 0 THEN m.revenue_total / m.orders_total ELSE 0 END,
    'averageTicket30d', CASE WHEN m.orders_30d > 0 THEN m.revenue_30d / m.orders_30d ELSE 0 END,
    'dailySales', (SELECT jsonb_agg(jsonb_build_object('date', df.date, 'orders', df.orders, 'revenue', df.revenue)) FROM daily_filled df),
    'topProducts', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', tp.id, 'title', tp.title, 'quantity', tp.quantity, 'revenue', tp.revenue)), '[]'::jsonb) FROM top_products tp),
    '_debug', jsonb_build_object(
      'cachedOrdersCount', m.orders_total,
      'cachedItemsCount', ic.total_items,
      'ordersWithItemsSynced', m.orders_with_items_synced,
      'itemsSyncedPercent', CASE WHEN m.orders_total > 0 THEN ROUND((m.orders_with_items_synced::numeric / m.orders_total) * 100, 1) ELSE 0 END,
      'source', 'rpc_get_sales_metrics'
    )
  )
  INTO v_result
  FROM metrics m, items_count ic;
  
  RETURN v_result;
END;
$$;