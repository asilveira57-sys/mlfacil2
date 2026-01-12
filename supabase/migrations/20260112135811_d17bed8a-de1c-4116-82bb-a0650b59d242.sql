-- 1) Add missing column to order_cost_breakdown_cache
ALTER TABLE public.order_cost_breakdown_cache 
ADD COLUMN IF NOT EXISTS fee_ml_source text DEFAULT 'estimated';

-- 2) Add useful indexes for performance
CREATE INDEX IF NOT EXISTS idx_order_cost_breakdown_seller_synced 
ON public.order_cost_breakdown_cache (seller_id, real_cost_synced_at);

CREATE INDEX IF NOT EXISTS idx_order_cost_breakdown_seller_total 
ON public.order_cost_breakdown_cache (seller_id, total_marketplace_cost);

-- 3) Create dedicated state table for real costs sync (separate from financial sync)
CREATE TABLE IF NOT EXISTS public.meli_real_costs_sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  seller_id text NOT NULL,
  status text NOT NULL DEFAULT 'idle', -- idle, running, paused, error, done
  scope_days int DEFAULT NULL, -- NULL means all-time
  processed int NOT NULL DEFAULT 0,
  total int NOT NULL DEFAULT 0,
  cursor_offset int NOT NULL DEFAULT 0,
  last_page_size int DEFAULT NULL,
  last_error text DEFAULT NULL,
  last_heartbeat_at timestamptz DEFAULT NULL,
  started_at timestamptz DEFAULT NULL,
  finished_at timestamptz DEFAULT NULL,
  stats_json jsonb DEFAULT NULL, -- counters for estimated/billing/etc
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(seller_id)
);

-- Enable RLS
ALTER TABLE public.meli_real_costs_sync_state ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own real costs sync state"
ON public.meli_real_costs_sync_state
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own real costs sync state"
ON public.meli_real_costs_sync_state
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own real costs sync state"
ON public.meli_real_costs_sync_state
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own real costs sync state"
ON public.meli_real_costs_sync_state
FOR DELETE
USING (auth.uid() = user_id);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_real_costs_sync_state_seller 
ON public.meli_real_costs_sync_state (seller_id);

-- 4) Create fee estimation cache table (optional optimization)
CREATE TABLE IF NOT EXISTS public.meli_listing_fee_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id text NOT NULL,
  listing_type_id text NOT NULL DEFAULT 'gold_pro',
  price_bucket int NOT NULL, -- price rounded to nearest 10
  fee_amount numeric NOT NULL,
  fee_percent numeric,
  raw_json jsonb DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(seller_id, listing_type_id, price_bucket)
);

-- Enable RLS
ALTER TABLE public.meli_listing_fee_cache ENABLE ROW LEVEL SECURITY;

-- RLS policies for fee cache
CREATE POLICY "Users can view their own fee cache"
ON public.meli_listing_fee_cache
FOR SELECT
USING (true); -- Public read for efficiency

CREATE POLICY "Users can insert fee cache"
ON public.meli_listing_fee_cache
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update fee cache"
ON public.meli_listing_fee_cache
FOR UPDATE
USING (true);

-- Index
CREATE INDEX IF NOT EXISTS idx_listing_fee_cache_lookup 
ON public.meli_listing_fee_cache (seller_id, listing_type_id, price_bucket);