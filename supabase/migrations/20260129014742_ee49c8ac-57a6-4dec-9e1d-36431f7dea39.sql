-- =========================================
-- TABLE: competitor_trackers
-- Main table for tracking competitor listings
-- =========================================
CREATE TABLE public.competitor_trackers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  marketplace TEXT NOT NULL DEFAULT 'mercadolivre',
  competitor_label TEXT NOT NULL,
  competitor_url TEXT NOT NULL,
  competitor_external_id TEXT,
  competitor_thumbnail TEXT,
  competitor_title TEXT,
  status TEXT NOT NULL DEFAULT 'ativo',
  min_price NUMERIC,
  max_price NUMERIC,
  reaction_mode TEXT NOT NULL DEFAULT 'monitorar',
  undercut_amount NUMERIC NOT NULL DEFAULT 0.10,
  check_interval_minutes INTEGER NOT NULL DEFAULT 120,
  last_checked_at TIMESTAMPTZ,
  next_check_at TIMESTAMPTZ DEFAULT now(),
  last_known_price NUMERIC,
  last_known_state TEXT DEFAULT 'desconhecido',
  seller_listing_id TEXT,
  consecutive_failures INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for competitor_trackers
CREATE INDEX idx_trackers_user_seller ON public.competitor_trackers(user_id, seller_id);
CREATE INDEX idx_trackers_status_next ON public.competitor_trackers(status, next_check_at);
CREATE INDEX idx_trackers_external ON public.competitor_trackers(competitor_external_id);

-- =========================================
-- TABLE: competitor_snapshots
-- Historical price/state captures
-- =========================================
CREATE TABLE public.competitor_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tracker_id UUID NOT NULL REFERENCES public.competitor_trackers(id) ON DELETE CASCADE,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  price NUMERIC,
  state TEXT,
  source TEXT DEFAULT 'api_publica',
  raw_meta JSONB
);

CREATE INDEX idx_snapshots_tracker_time ON public.competitor_snapshots(tracker_id, captured_at DESC);

-- =========================================
-- TABLE: competitor_events
-- Derived events from captures
-- =========================================
CREATE TABLE public.competitor_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tracker_id UUID NOT NULL REFERENCES public.competitor_trackers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  prev_price NUMERIC,
  new_price NUMERIC,
  message TEXT
);

CREATE INDEX idx_events_tracker_time ON public.competitor_events(tracker_id, created_at DESC);
CREATE INDEX idx_events_user ON public.competitor_events(user_id, created_at DESC);

-- =========================================
-- TABLE: competitor_price_actions
-- Suggested or applied price actions
-- =========================================
CREATE TABLE public.competitor_price_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tracker_id UUID NOT NULL REFERENCES public.competitor_trackers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  seller_listing_id TEXT,
  action_type TEXT NOT NULL,
  reason TEXT,
  competitor_price NUMERIC,
  proposed_price NUMERIC,
  applied_price NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_actions_tracker ON public.competitor_price_actions(tracker_id, created_at DESC);
CREATE INDEX idx_actions_user ON public.competitor_price_actions(user_id, created_at DESC);

-- =========================================
-- TABLE: competitor_alerts
-- User-facing alerts inbox
-- =========================================
CREATE TABLE public.competitor_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  tracker_id UUID REFERENCES public.competitor_trackers(id) ON DELETE CASCADE,
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_alerts_user_read ON public.competitor_alerts(user_id, is_read, created_at DESC);
CREATE INDEX idx_alerts_seller ON public.competitor_alerts(user_id, seller_id, created_at DESC);

-- =========================================
-- TABLE: competitor_rate_limits
-- Rate limiting per user
-- =========================================
CREATE TABLE public.competitor_rate_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  requests_today INTEGER DEFAULT 0,
  last_request_at TIMESTAMPTZ,
  window_start TIMESTAMPTZ DEFAULT now(),
  daily_limit INTEGER DEFAULT 500,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rate_limits_user ON public.competitor_rate_limits(user_id);

-- =========================================
-- RLS POLICIES
-- =========================================
ALTER TABLE public.competitor_trackers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_price_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_rate_limits ENABLE ROW LEVEL SECURITY;

-- Policies for competitor_trackers
CREATE POLICY "Users can view own trackers" ON public.competitor_trackers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own trackers" ON public.competitor_trackers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own trackers" ON public.competitor_trackers FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own trackers" ON public.competitor_trackers FOR DELETE USING (auth.uid() = user_id);

-- Policies for competitor_snapshots (via tracker ownership)
CREATE POLICY "Users can view own snapshots" ON public.competitor_snapshots FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.competitor_trackers t WHERE t.id = tracker_id AND t.user_id = auth.uid()));
CREATE POLICY "Users can insert own snapshots" ON public.competitor_snapshots FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM public.competitor_trackers t WHERE t.id = tracker_id AND t.user_id = auth.uid()));

-- Policies for competitor_events
CREATE POLICY "Users can view own events" ON public.competitor_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own events" ON public.competitor_events FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policies for competitor_price_actions
CREATE POLICY "Users can view own actions" ON public.competitor_price_actions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own actions" ON public.competitor_price_actions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own actions" ON public.competitor_price_actions FOR UPDATE USING (auth.uid() = user_id);

-- Policies for competitor_alerts
CREATE POLICY "Users can view own alerts" ON public.competitor_alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own alerts" ON public.competitor_alerts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own alerts" ON public.competitor_alerts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own alerts" ON public.competitor_alerts FOR DELETE USING (auth.uid() = user_id);

-- Policies for rate limits
CREATE POLICY "Users can view own limits" ON public.competitor_rate_limits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own limits" ON public.competitor_rate_limits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own limits" ON public.competitor_rate_limits FOR UPDATE USING (auth.uid() = user_id);

-- =========================================
-- TRIGGERS for updated_at
-- =========================================
CREATE TRIGGER update_competitor_trackers_updated_at
  BEFORE UPDATE ON public.competitor_trackers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_competitor_rate_limits_updated_at
  BEFORE UPDATE ON public.competitor_rate_limits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();