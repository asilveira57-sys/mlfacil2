-- =============================================
-- AD TIMELINE MODULE - COMPLETE SCHEMA
-- =============================================

-- 1. Ad Timeline Stats - Core metrics per listing
CREATE TABLE public.ad_timeline_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  ml_account_id UUID NOT NULL,
  item_id TEXT NOT NULL,
  last_sale_at TIMESTAMPTZ,
  first_sale_at TIMESTAMPTZ,
  sales_count_30d INT DEFAULT 0,
  sales_count_60d INT DEFAULT 0,
  sales_count_90d INT DEFAULT 0,
  sales_count_120d INT DEFAULT 0,
  avg_gap_hours NUMERIC,
  median_gap_hours NUMERIC,
  max_gap_hours NUMERIC,
  days_since_last_sale INT,
  status_bucket TEXT DEFAULT 'NO_SALES',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, ml_account_id, item_id)
);

-- 2. Ad Timeline Events - Sales and gap events
CREATE TABLE public.ad_timeline_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  ml_account_id UUID NOT NULL,
  item_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Ad Lifecycle Actions - Queued actions (END/RELIST/CLONE)
CREATE TABLE public.ad_lifecycle_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  ml_account_id UUID NOT NULL,
  item_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_status TEXT NOT NULL DEFAULT 'DRAFT',
  reason TEXT,
  checklist JSONB DEFAULT '{}',
  source_snapshot JSONB DEFAULT '{}',
  result JSONB DEFAULT '{}',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Ad Lifecycle Experiments - Before/after comparison
CREATE TABLE public.ad_lifecycle_experiments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  ml_account_id UUID NOT NULL,
  source_item_id TEXT NOT NULL,
  new_item_id TEXT,
  method TEXT NOT NULL,
  baseline JSONB DEFAULT '{}',
  after_7d JSONB,
  after_14d JSONB,
  after_30d JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Ad Timeline Settings - Per workspace/account configuration
CREATE TABLE public.ad_timeline_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  ml_account_id UUID,
  thresholds_days JSONB DEFAULT '[30, 60, 90, 120]',
  recalc_frequency_hours INT DEFAULT 6,
  no_sales_policy TEXT DEFAULT 'INCLUDE',
  action_safety JSONB DEFAULT '{"require_confirmation": true, "daily_limit": 50}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, ml_account_id)
);

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX idx_ad_timeline_stats_workspace_account_bucket 
  ON public.ad_timeline_stats(workspace_id, ml_account_id, status_bucket);
CREATE INDEX idx_ad_timeline_stats_workspace_account_item 
  ON public.ad_timeline_stats(workspace_id, ml_account_id, item_id);
CREATE INDEX idx_ad_timeline_stats_days_since 
  ON public.ad_timeline_stats(workspace_id, days_since_last_sale);

CREATE INDEX idx_ad_timeline_events_workspace_item 
  ON public.ad_timeline_events(workspace_id, ml_account_id, item_id);
CREATE INDEX idx_ad_timeline_events_occurred 
  ON public.ad_timeline_events(workspace_id, occurred_at DESC);

CREATE INDEX idx_ad_lifecycle_actions_workspace_status 
  ON public.ad_lifecycle_actions(workspace_id, ml_account_id, action_status);
CREATE INDEX idx_ad_lifecycle_actions_item 
  ON public.ad_lifecycle_actions(workspace_id, item_id);

CREATE INDEX idx_ad_lifecycle_experiments_source 
  ON public.ad_lifecycle_experiments(workspace_id, source_item_id);

-- =============================================
-- RLS POLICIES
-- =============================================

-- Enable RLS on all tables
ALTER TABLE public.ad_timeline_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_lifecycle_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_lifecycle_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_timeline_settings ENABLE ROW LEVEL SECURITY;

-- ad_timeline_stats policies
CREATE POLICY "Users can view their workspace ad_timeline_stats"
  ON public.ad_timeline_stats FOR SELECT
  USING (
    workspace_id IN (
      SELECT w.id FROM public.workspaces w
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert ad_timeline_stats for their workspaces"
  ON public.ad_timeline_stats FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT w.id FROM public.workspaces w
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update ad_timeline_stats for their workspaces"
  ON public.ad_timeline_stats FOR UPDATE
  USING (
    workspace_id IN (
      SELECT w.id FROM public.workspaces w
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid()
    )
  );

-- ad_timeline_events policies
CREATE POLICY "Users can view their workspace ad_timeline_events"
  ON public.ad_timeline_events FOR SELECT
  USING (
    workspace_id IN (
      SELECT w.id FROM public.workspaces w
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert ad_timeline_events for their workspaces"
  ON public.ad_timeline_events FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT w.id FROM public.workspaces w
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid()
    )
  );

-- ad_lifecycle_actions policies
CREATE POLICY "Users can view their workspace ad_lifecycle_actions"
  ON public.ad_lifecycle_actions FOR SELECT
  USING (
    workspace_id IN (
      SELECT w.id FROM public.workspaces w
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert ad_lifecycle_actions for their workspaces"
  ON public.ad_lifecycle_actions FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT w.id FROM public.workspaces w
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update ad_lifecycle_actions for their workspaces"
  ON public.ad_lifecycle_actions FOR UPDATE
  USING (
    workspace_id IN (
      SELECT w.id FROM public.workspaces w
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete ad_lifecycle_actions for their workspaces"
  ON public.ad_lifecycle_actions FOR DELETE
  USING (
    workspace_id IN (
      SELECT w.id FROM public.workspaces w
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid()
    )
  );

-- ad_lifecycle_experiments policies
CREATE POLICY "Users can view their workspace ad_lifecycle_experiments"
  ON public.ad_lifecycle_experiments FOR SELECT
  USING (
    workspace_id IN (
      SELECT w.id FROM public.workspaces w
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert ad_lifecycle_experiments for their workspaces"
  ON public.ad_lifecycle_experiments FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT w.id FROM public.workspaces w
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update ad_lifecycle_experiments for their workspaces"
  ON public.ad_lifecycle_experiments FOR UPDATE
  USING (
    workspace_id IN (
      SELECT w.id FROM public.workspaces w
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid()
    )
  );

-- ad_timeline_settings policies
CREATE POLICY "Users can view their workspace ad_timeline_settings"
  ON public.ad_timeline_settings FOR SELECT
  USING (
    workspace_id IN (
      SELECT w.id FROM public.workspaces w
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert ad_timeline_settings for their workspaces"
  ON public.ad_timeline_settings FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT w.id FROM public.workspaces w
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update ad_timeline_settings for their workspaces"
  ON public.ad_timeline_settings FOR UPDATE
  USING (
    workspace_id IN (
      SELECT w.id FROM public.workspaces w
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid()
    )
  );

-- =============================================
-- TRIGGER FOR updated_at
-- =============================================
CREATE OR REPLACE FUNCTION public.update_ad_timeline_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_ad_timeline_stats_updated_at
  BEFORE UPDATE ON public.ad_timeline_stats
  FOR EACH ROW EXECUTE FUNCTION public.update_ad_timeline_updated_at();

CREATE TRIGGER update_ad_lifecycle_actions_updated_at
  BEFORE UPDATE ON public.ad_lifecycle_actions
  FOR EACH ROW EXECUTE FUNCTION public.update_ad_timeline_updated_at();

CREATE TRIGGER update_ad_lifecycle_experiments_updated_at
  BEFORE UPDATE ON public.ad_lifecycle_experiments
  FOR EACH ROW EXECUTE FUNCTION public.update_ad_timeline_updated_at();

CREATE TRIGGER update_ad_timeline_settings_updated_at
  BEFORE UPDATE ON public.ad_timeline_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_ad_timeline_updated_at();