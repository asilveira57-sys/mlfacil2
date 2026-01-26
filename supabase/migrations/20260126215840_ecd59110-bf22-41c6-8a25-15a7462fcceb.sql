-- ============================================
-- MERCADO ADS DATA CONNECTORS LAYER
-- ============================================

-- 1) Connection status per account (multiconta)
CREATE TABLE public.ads_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  
  -- Connection status
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'expired', 'error', 'disconnected', 'pending')),
  status_message TEXT,
  connected_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  
  -- Last sync info
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT CHECK (last_sync_status IN ('success', 'partial', 'error')),
  last_sync_message TEXT,
  
  -- Sync configuration
  sync_interval_hours INTEGER NOT NULL DEFAULT 6,
  next_scheduled_sync_at TIMESTAMPTZ,
  auto_sync_enabled BOOLEAN NOT NULL DEFAULT true,
  
  -- Metadata
  ml_account_name TEXT,
  ml_account_email TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(user_id, seller_id)
);

-- 2) Credential storage with token management
CREATE TABLE public.ads_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id UUID NOT NULL REFERENCES public.ads_connections(id) ON DELETE CASCADE,
  
  -- Tokens (encrypted values should be stored via Supabase Vault in production)
  access_token_hash TEXT, -- We store a hash for verification, actual token in vault
  refresh_token_hash TEXT,
  
  -- Expiration tracking
  access_token_expires_at TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  
  -- Status
  is_valid BOOLEAN NOT NULL DEFAULT true,
  last_refresh_at TIMESTAMPTZ,
  last_refresh_error TEXT,
  refresh_failure_count INTEGER NOT NULL DEFAULT 0,
  
  -- Scopes granted
  scopes TEXT[],
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(connection_id)
);

-- 3) Sync Jobs configuration and tracking
CREATE TABLE public.ads_sync_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id UUID NOT NULL REFERENCES public.ads_connections(id) ON DELETE CASCADE,
  
  -- Job type
  job_type TEXT NOT NULL CHECK (job_type IN ('full', 'incremental', 'campaigns', 'ad_groups', 'items', 'metrics', 'daily_metrics')),
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  
  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Progress
  total_records INTEGER,
  processed_records INTEGER DEFAULT 0,
  failed_records INTEGER DEFAULT 0,
  
  -- Configuration
  date_from DATE,
  date_to DATE,
  priority INTEGER NOT NULL DEFAULT 5,
  
  -- Results
  error_message TEXT,
  error_details JSONB,
  result_summary JSONB,
  
  -- Retry handling
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4) Staging tables for raw API data
CREATE TABLE public.ads_staging_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.ads_sync_jobs(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.ads_connections(id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL,
  
  -- Raw data
  ml_campaign_id TEXT NOT NULL,
  raw_data JSONB NOT NULL,
  
  -- Parsed fields for quick access
  name TEXT,
  status TEXT,
  campaign_type TEXT,
  daily_budget NUMERIC,
  total_budget NUMERIC,
  start_date DATE,
  end_date DATE,
  
  -- Processing status
  is_processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  processing_error TEXT,
  
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.ads_staging_ad_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.ads_sync_jobs(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.ads_connections(id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL,
  
  ml_ad_group_id TEXT NOT NULL,
  ml_campaign_id TEXT NOT NULL,
  raw_data JSONB NOT NULL,
  
  name TEXT,
  status TEXT,
  default_bid NUMERIC,
  
  is_processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  processing_error TEXT,
  
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.ads_staging_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.ads_sync_jobs(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.ads_connections(id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL,
  
  item_id TEXT NOT NULL,
  ml_ad_group_id TEXT,
  raw_data JSONB NOT NULL,
  
  title TEXT,
  status TEXT,
  bid NUMERIC,
  current_price NUMERIC,
  
  is_processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  processing_error TEXT,
  
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.ads_staging_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.ads_sync_jobs(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.ads_connections(id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL,
  
  -- Entity reference
  entity_type TEXT NOT NULL CHECK (entity_type IN ('campaign', 'ad_group', 'item')),
  entity_id TEXT NOT NULL,
  metric_date DATE NOT NULL,
  
  raw_data JSONB NOT NULL,
  
  -- Parsed metrics
  impressions INTEGER,
  clicks INTEGER,
  conversions INTEGER,
  spent NUMERIC,
  revenue NUMERIC,
  
  is_processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  processing_error TEXT,
  
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5) Snapshots for auditing
CREATE TABLE public.ads_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id UUID NOT NULL REFERENCES public.ads_connections(id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL,
  job_id UUID REFERENCES public.ads_sync_jobs(id) ON DELETE SET NULL,
  
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('campaigns', 'ad_groups', 'items', 'metrics', 'full')),
  snapshot_date DATE NOT NULL,
  snapshot_hour INTEGER,
  
  -- Aggregated snapshot data
  data_json JSONB NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  
  -- Metadata
  is_valid BOOLEAN NOT NULL DEFAULT true,
  superseded_by UUID REFERENCES public.ads_snapshots(id),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6) Sync logs for auditing
CREATE TABLE public.ads_sync_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id UUID NOT NULL REFERENCES public.ads_connections(id) ON DELETE CASCADE,
  job_id UUID REFERENCES public.ads_sync_jobs(id) ON DELETE SET NULL,
  seller_id TEXT NOT NULL,
  
  -- Log type
  log_type TEXT NOT NULL CHECK (log_type IN ('campaigns', 'ad_groups', 'items', 'metrics', 'consolidation', 'token_refresh', 'connection', 'error')),
  log_level TEXT NOT NULL DEFAULT 'info' CHECK (log_level IN ('debug', 'info', 'warn', 'error')),
  
  -- Timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_ms INTEGER,
  
  -- Result
  success BOOLEAN,
  message TEXT,
  details JSONB,
  
  -- Metrics
  records_fetched INTEGER,
  records_processed INTEGER,
  records_created INTEGER,
  records_updated INTEGER,
  records_failed INTEGER,
  
  -- Error info
  error_code TEXT,
  error_message TEXT,
  error_stack TEXT,
  
  -- Rate limit info
  rate_limit_remaining INTEGER,
  rate_limit_reset_at TIMESTAMPTZ,
  retry_after_seconds INTEGER,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7) Data freshness tracking for resilience
CREATE TABLE public.ads_data_freshness (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id UUID NOT NULL REFERENCES public.ads_connections(id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL,
  
  data_type TEXT NOT NULL CHECK (data_type IN ('campaigns', 'ad_groups', 'items', 'daily_metrics', 'summary_metrics')),
  
  -- Freshness info
  last_successful_sync_at TIMESTAMPTZ,
  last_sync_attempt_at TIMESTAMPTZ,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  
  -- Data validity
  is_stale BOOLEAN NOT NULL DEFAULT false,
  stale_threshold_hours INTEGER NOT NULL DEFAULT 24,
  
  -- Cached counts for quick UI
  cached_record_count INTEGER,
  cached_date_range_from DATE,
  cached_date_range_to DATE,
  
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(connection_id, data_type)
);

-- Indexes for performance
CREATE INDEX idx_ads_connections_user ON public.ads_connections(user_id, status);
CREATE INDEX idx_ads_connections_seller ON public.ads_connections(seller_id);
CREATE INDEX idx_ads_connections_next_sync ON public.ads_connections(next_scheduled_sync_at) WHERE auto_sync_enabled = true;

CREATE INDEX idx_ads_sync_jobs_connection ON public.ads_sync_jobs(connection_id, status);
CREATE INDEX idx_ads_sync_jobs_status ON public.ads_sync_jobs(status, priority) WHERE status = 'pending';
CREATE INDEX idx_ads_sync_jobs_retry ON public.ads_sync_jobs(next_retry_at) WHERE status = 'failed' AND retry_count < max_retries;

CREATE INDEX idx_ads_staging_campaigns_job ON public.ads_staging_campaigns(job_id, is_processed);
CREATE INDEX idx_ads_staging_ad_groups_job ON public.ads_staging_ad_groups(job_id, is_processed);
CREATE INDEX idx_ads_staging_items_job ON public.ads_staging_items(job_id, is_processed);
CREATE INDEX idx_ads_staging_metrics_job ON public.ads_staging_metrics(job_id, is_processed);

CREATE INDEX idx_ads_snapshots_connection ON public.ads_snapshots(connection_id, snapshot_type, snapshot_date DESC);
CREATE INDEX idx_ads_sync_logs_connection ON public.ads_sync_logs(connection_id, log_type, created_at DESC);
CREATE INDEX idx_ads_data_freshness_stale ON public.ads_data_freshness(is_stale, last_successful_sync_at);

-- Enable RLS
ALTER TABLE public.ads_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_staging_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_staging_ad_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_staging_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_staging_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_data_freshness ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own connections"
  ON public.ads_connections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own connections"
  ON public.ads_connections FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own credentials"
  ON public.ads_credentials FOR SELECT 
  USING (connection_id IN (SELECT id FROM public.ads_connections WHERE user_id = auth.uid()));

CREATE POLICY "Users can view their own sync jobs"
  ON public.ads_sync_jobs FOR SELECT 
  USING (connection_id IN (SELECT id FROM public.ads_connections WHERE user_id = auth.uid()));

CREATE POLICY "Users can view their own staging campaigns"
  ON public.ads_staging_campaigns FOR SELECT 
  USING (connection_id IN (SELECT id FROM public.ads_connections WHERE user_id = auth.uid()));

CREATE POLICY "Users can view their own staging ad groups"
  ON public.ads_staging_ad_groups FOR SELECT 
  USING (connection_id IN (SELECT id FROM public.ads_connections WHERE user_id = auth.uid()));

CREATE POLICY "Users can view their own staging items"
  ON public.ads_staging_items FOR SELECT 
  USING (connection_id IN (SELECT id FROM public.ads_connections WHERE user_id = auth.uid()));

CREATE POLICY "Users can view their own staging metrics"
  ON public.ads_staging_metrics FOR SELECT 
  USING (connection_id IN (SELECT id FROM public.ads_connections WHERE user_id = auth.uid()));

CREATE POLICY "Users can view their own snapshots"
  ON public.ads_snapshots FOR SELECT 
  USING (connection_id IN (SELECT id FROM public.ads_connections WHERE user_id = auth.uid()));

CREATE POLICY "Users can view their own sync logs"
  ON public.ads_sync_logs FOR SELECT 
  USING (connection_id IN (SELECT id FROM public.ads_connections WHERE user_id = auth.uid()));

CREATE POLICY "Users can view their own data freshness"
  ON public.ads_data_freshness FOR SELECT 
  USING (connection_id IN (SELECT id FROM public.ads_connections WHERE user_id = auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_ads_connections_updated_at
  BEFORE UPDATE ON public.ads_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ads_credentials_updated_at
  BEFORE UPDATE ON public.ads_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ads_sync_jobs_updated_at
  BEFORE UPDATE ON public.ads_sync_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ads_data_freshness_updated_at
  BEFORE UPDATE ON public.ads_data_freshness
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();