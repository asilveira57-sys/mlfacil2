
-- Enum for seed/plant health status
CREATE TYPE public.send_health_status AS ENUM ('healthy', 'stagnant', 'weakening', 'dormant');

-- Enum for growth stage
CREATE TYPE public.send_growth_stage AS ENUM ('seed', 'sprout', 'growing', 'mature', 'fruiting');

-- Enum for position tier
CREATE TYPE public.send_position_tier AS ENUM ('top_page_1', 'page_1', 'page_2', 'page_3_plus', 'not_found');

-- User seed balance (per account)
CREATE TABLE public.send_seed_balance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  seeds_from_plan INT NOT NULL DEFAULT 5,
  seeds_purchased INT NOT NULL DEFAULT 0,
  seeds_used INT NOT NULL DEFAULT 0,
  plan_tier TEXT DEFAULT 'basic',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, seller_id)
);

-- Planted items (items in Send)
CREATE TABLE public.send_planted_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_title TEXT,
  item_thumbnail TEXT,
  planted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  health_status public.send_health_status NOT NULL DEFAULT 'healthy',
  growth_stage public.send_growth_stage NOT NULL DEFAULT 'seed',
  days_planted INT NOT NULL DEFAULT 0,
  abc_class TEXT DEFAULT 'A',
  is_a_plus BOOLEAN DEFAULT false,
  last_health_check_at TIMESTAMPTZ,
  last_metrics_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, seller_id, item_id)
);

-- Metrics snapshots for planted items
CREATE TABLE public.send_metrics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planted_item_id UUID NOT NULL REFERENCES public.send_planted_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  snapshot_date DATE NOT NULL,
  -- Sales metrics
  sales_count_7d INT DEFAULT 0,
  sales_count_30d INT DEFAULT 0,
  avg_sales_interval_hours NUMERIC,
  sales_stability_score NUMERIC, -- 0-100
  -- Visit metrics
  visits_7d INT DEFAULT 0,
  visits_30d INT DEFAULT 0,
  visit_trend NUMERIC, -- percentage change
  -- Conversion
  conversion_rate NUMERIC,
  conversion_trend NUMERIC,
  -- Position tracking
  position_tier public.send_position_tier,
  position_checked_at TIMESTAMPTZ,
  search_keyword TEXT,
  -- Maturity indicators
  maturity_score NUMERIC, -- 0-100
  growth_velocity NUMERIC, -- rate of improvement
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- History log for planted items (lifecycle events)
CREATE TABLE public.send_item_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  event_type TEXT NOT NULL, -- 'planted', 'removed', 'health_changed', 'stage_changed', 'milestone'
  event_data JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed purchase transactions
CREATE TABLE public.send_seed_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  seeds_quantity INT NOT NULL,
  amount_brl NUMERIC NOT NULL,
  payment_id TEXT,
  payment_status TEXT DEFAULT 'pending',
  payment_method TEXT DEFAULT 'mercadopago',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A+ candidates tracking (recurring Curve A items)
CREATE TABLE public.send_aplus_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_title TEXT,
  consecutive_periods INT DEFAULT 1,
  periods_in_curve_a JSONB, -- array of period keys when it was A
  total_revenue NUMERIC DEFAULT 0,
  stability_score NUMERIC DEFAULT 0,
  is_promoted_to_aplus BOOLEAN DEFAULT false,
  last_evaluated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, seller_id, item_id)
);

-- Enable RLS on all tables
ALTER TABLE public.send_seed_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.send_planted_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.send_metrics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.send_item_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.send_seed_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.send_aplus_candidates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own seed balance" ON public.send_seed_balance FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own seed balance" ON public.send_seed_balance FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own seed balance" ON public.send_seed_balance FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own planted items" ON public.send_planted_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own planted items" ON public.send_planted_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own planted items" ON public.send_planted_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own planted items" ON public.send_planted_items FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own metrics" ON public.send_metrics_snapshots FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own metrics" ON public.send_metrics_snapshots FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own history" ON public.send_item_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own history" ON public.send_item_history FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own purchases" ON public.send_seed_purchases FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own purchases" ON public.send_seed_purchases FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own purchases" ON public.send_seed_purchases FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own aplus candidates" ON public.send_aplus_candidates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own aplus candidates" ON public.send_aplus_candidates FOR ALL USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_send_planted_seller ON public.send_planted_items(user_id, seller_id);
CREATE INDEX idx_send_planted_item ON public.send_planted_items(item_id);
CREATE INDEX idx_send_metrics_planted ON public.send_metrics_snapshots(planted_item_id);
CREATE INDEX idx_send_metrics_date ON public.send_metrics_snapshots(snapshot_date);
CREATE INDEX idx_send_history_item ON public.send_item_history(user_id, seller_id, item_id);
CREATE INDEX idx_send_aplus_seller ON public.send_aplus_candidates(user_id, seller_id);

-- Function to get available seeds
CREATE OR REPLACE FUNCTION public.get_send_available_seeds(p_user_id UUID, p_seller_id TEXT)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (seeds_from_plan + seeds_purchased - seeds_used)
     FROM send_seed_balance
     WHERE user_id = p_user_id AND seller_id = p_seller_id),
    5 -- default for new users
  );
$$;
