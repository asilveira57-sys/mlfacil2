-- =====================================================
-- SELLER CATEGORY ACTIVITY - Dynamic categories based on real sales
-- =====================================================

-- Table: account_category_activity
-- Stores seller's category activity with metrics for auto-pinning
CREATE TABLE IF NOT EXISTS public.account_category_activity (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  account_id TEXT NOT NULL, -- ml_user_id from ml_accounts
  category_id TEXT NOT NULL,
  category_path TEXT[] DEFAULT '{}', -- full breadcrumb path
  level1_category_id TEXT, -- root category ID
  level1_category_name TEXT, -- root category name
  category_name TEXT, -- leaf category name for display
  
  -- 90-day metrics
  orders_count_90d INTEGER DEFAULT 0,
  gmv_90d NUMERIC(12,2) DEFAULT 0,
  units_sold_90d INTEGER DEFAULT 0,
  
  -- 30-day metrics (for new accounts)
  orders_count_30d INTEGER DEFAULT 0,
  gmv_30d NUMERIC(12,2) DEFAULT 0,
  units_sold_30d INTEGER DEFAULT 0,
  
  -- Activity tracking
  last_order_at TIMESTAMPTZ,
  first_order_at TIMESTAMPTZ,
  
  -- Status flags
  is_active BOOLEAN DEFAULT false, -- meets activity threshold
  is_pinned_auto BOOLEAN DEFAULT false, -- always visible
  pinned_reason TEXT, -- 'top_gmv_90d', 'min_orders_threshold', 'top_gmv_30d_new_account'
  pinned_rank INTEGER, -- rank within pinned categories
  
  -- Timestamps
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Unique constraint per account+category
  UNIQUE(account_id, category_id)
);

-- Table: trends_category_visibility
-- Manual overrides for category visibility in UI
CREATE TABLE IF NOT EXISTS public.trends_category_visibility (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  account_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'auto' CHECK (mode IN ('auto', 'force_show', 'force_hide')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(account_id, category_id)
);

-- Table: account_category_sync_state
-- Tracks sync job state per account
CREATE TABLE IF NOT EXISTS public.account_category_sync_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  account_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'completed', 'failed')),
  last_sync_at TIMESTAMPTZ,
  last_sync_duration_ms INTEGER,
  categories_found INTEGER DEFAULT 0,
  categories_pinned INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.account_category_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trends_category_visibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_category_sync_state ENABLE ROW LEVEL SECURITY;

-- RLS Policies for account_category_activity
CREATE POLICY "Users can view their own category activity"
ON public.account_category_activity FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own category activity"
ON public.account_category_activity FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own category activity"
ON public.account_category_activity FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own category activity"
ON public.account_category_activity FOR DELETE
USING (auth.uid() = user_id);

-- RLS Policies for trends_category_visibility
CREATE POLICY "Users can view their own visibility settings"
ON public.trends_category_visibility FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own visibility settings"
ON public.trends_category_visibility FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own visibility settings"
ON public.trends_category_visibility FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own visibility settings"
ON public.trends_category_visibility FOR DELETE
USING (auth.uid() = user_id);

-- RLS Policies for account_category_sync_state
CREATE POLICY "Users can view their own sync state"
ON public.account_category_sync_state FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sync state"
ON public.account_category_sync_state FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sync state"
ON public.account_category_sync_state FOR UPDATE
USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_account_category_activity_account 
ON public.account_category_activity(account_id);

CREATE INDEX IF NOT EXISTS idx_account_category_activity_pinned 
ON public.account_category_activity(account_id, is_pinned_auto) 
WHERE is_pinned_auto = true;

CREATE INDEX IF NOT EXISTS idx_account_category_activity_active 
ON public.account_category_activity(account_id, is_active) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_account_category_activity_level1 
ON public.account_category_activity(account_id, level1_category_id);

CREATE INDEX IF NOT EXISTS idx_trends_category_visibility_account 
ON public.trends_category_visibility(account_id);

-- Triggers for updated_at
CREATE TRIGGER update_account_category_activity_updated_at
BEFORE UPDATE ON public.account_category_activity
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_trends_category_visibility_updated_at
BEFORE UPDATE ON public.trends_category_visibility
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_account_category_sync_state_updated_at
BEFORE UPDATE ON public.account_category_sync_state
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to get seller's visible categories
CREATE OR REPLACE FUNCTION public.get_seller_visible_categories(
  p_user_id UUID,
  p_account_id TEXT,
  p_limit INTEGER DEFAULT 12
)
RETURNS TABLE (
  category_id TEXT,
  category_name TEXT,
  category_path TEXT[],
  level1_category_id TEXT,
  level1_category_name TEXT,
  orders_count_90d INTEGER,
  gmv_90d NUMERIC,
  is_pinned_auto BOOLEAN,
  pinned_reason TEXT,
  visibility_mode TEXT,
  source TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT 
      a.category_id,
      a.category_name,
      a.category_path,
      a.level1_category_id,
      a.level1_category_name,
      a.orders_count_90d,
      a.gmv_90d,
      a.is_pinned_auto,
      a.pinned_reason,
      COALESCE(v.mode, 'auto') as visibility_mode,
      CASE 
        WHEN v.mode = 'force_show' THEN 'manual'
        WHEN a.is_pinned_auto THEN 'auto_pinned'
        WHEN a.is_active THEN 'active'
        ELSE 'inactive'
      END as source
    FROM account_category_activity a
    LEFT JOIN trends_category_visibility v 
      ON v.account_id = a.account_id AND v.category_id = a.category_id
    WHERE a.account_id = p_account_id
      AND a.user_id = p_user_id
      AND (
        -- Include if: pinned, active, or force_show
        a.is_pinned_auto = true 
        OR a.is_active = true 
        OR v.mode = 'force_show'
      )
      AND COALESCE(v.mode, 'auto') != 'force_hide'
  )
  SELECT 
    b.category_id,
    b.category_name,
    b.category_path,
    b.level1_category_id,
    b.level1_category_name,
    b.orders_count_90d,
    b.gmv_90d,
    b.is_pinned_auto,
    b.pinned_reason,
    b.visibility_mode,
    b.source
  FROM base b
  ORDER BY 
    -- force_show first
    CASE WHEN b.visibility_mode = 'force_show' THEN 0 ELSE 1 END,
    -- then pinned by GMV
    CASE WHEN b.is_pinned_auto THEN 0 ELSE 1 END,
    b.gmv_90d DESC NULLS LAST,
    b.orders_count_90d DESC NULLS LAST
  LIMIT p_limit;
END;
$$;