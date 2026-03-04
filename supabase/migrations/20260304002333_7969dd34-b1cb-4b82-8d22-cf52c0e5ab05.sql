
-- ============================================================
-- EMAIL MODULE - Phase 1: Core Tables
-- ============================================================

-- Enum for provider types
CREATE TYPE public.email_provider_type AS ENUM (
  'SMTP', 'RESEND', 'SENDGRID', 'SES', 'MAILGUN', 'POSTMARK', 'BREVO'
);

-- Enum for test status
CREATE TYPE public.email_test_status AS ENUM ('ok', 'fail');

-- Enum for queue status
CREATE TYPE public.email_queue_status AS ENUM (
  'queued', 'sending', 'sent', 'failed', 'cancelled'
);

-- Enum for source type
CREATE TYPE public.email_source_type AS ENUM (
  'event', 'schedule', 'campaign', 'manual_test'
);

-- Enum for log actions
CREATE TYPE public.email_log_action AS ENUM (
  'enqueue', 'dequeue', 'send_attempt', 'sent', 'fail', 'cancel',
  'skip_opt_out', 'dedup_block', 'throttle_block', 'invalid_email'
);

-- ============================================================
-- A) Provider Settings
-- ============================================================
CREATE TABLE public.email_provider_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_type public.email_provider_type NOT NULL DEFAULT 'RESEND',
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  from_name TEXT NOT NULL DEFAULT '',
  from_email TEXT NOT NULL DEFAULT '',
  reply_to_email TEXT,
  smtp_host TEXT,
  smtp_port INTEGER,
  smtp_username TEXT,
  smtp_password_encrypted TEXT,
  api_key_encrypted TEXT,
  domain_verified BOOLEAN NOT NULL DEFAULT false,
  last_test_at TIMESTAMPTZ,
  last_test_status public.email_test_status,
  last_test_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_provider_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_email_provider" ON public.email_provider_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- B) Email Categories
-- ============================================================
CREATE TABLE public.email_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  default_opt_in BOOLEAN NOT NULL DEFAULT true,
  can_user_opt_out BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_categories ENABLE ROW LEVEL SECURITY;

-- Categories are readable by all authenticated users (for preference UI)
CREATE POLICY "anyone_read_email_categories" ON public.email_categories
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin_manage_email_categories" ON public.email_categories
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- B2) User Email Preferences
-- ============================================================
CREATE TABLE public.user_email_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.email_categories(id) ON DELETE CASCADE,
  is_opted_in BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, category_id)
);

ALTER TABLE public.user_email_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_preferences" ON public.user_email_preferences
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "admin_read_all_preferences" ON public.user_email_preferences
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- C) Email Templates
-- ============================================================
CREATE TABLE public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  category_id UUID NOT NULL REFERENCES public.email_categories(id),
  name TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',
  variables_schema_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_email_templates" ON public.email_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- C2) Template Versions (audit/rollback)
-- ============================================================
CREATE TABLE public.email_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.email_templates(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',
  variables_schema_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_template_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_template_versions" ON public.email_template_versions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- G) Email Queue
-- ============================================================
CREATE TABLE public.email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type public.email_source_type NOT NULL,
  source_id TEXT,
  template_id UUID REFERENCES public.email_templates(id),
  user_id UUID REFERENCES auth.users(id),
  company_id UUID,
  to_email TEXT NOT NULL,
  subject_resolved TEXT NOT NULL DEFAULT '',
  body_html_resolved TEXT NOT NULL DEFAULT '',
  body_text_resolved TEXT NOT NULL DEFAULT '',
  variables_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status public.email_queue_status NOT NULL DEFAULT 'queued',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_retry_at TIMESTAMPTZ,
  priority INTEGER NOT NULL DEFAULT 0,
  provider_message_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_email_queue" ON public.email_queue
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_email_queue_status ON public.email_queue (status, next_retry_at);
CREATE INDEX idx_email_queue_created ON public.email_queue (created_at DESC);

-- ============================================================
-- G2) Email Logs
-- ============================================================
CREATE TABLE public.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action public.email_log_action NOT NULL,
  source_type public.email_source_type,
  source_id TEXT,
  event_key TEXT,
  schedule_key TEXT,
  campaign_id UUID,
  user_id UUID,
  company_id UUID,
  email TEXT,
  template_id UUID,
  queue_id UUID,
  message TEXT,
  details_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_email_logs" ON public.email_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Service role can insert logs
CREATE POLICY "service_insert_email_logs" ON public.email_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE INDEX idx_email_logs_created ON public.email_logs (created_at DESC);
CREATE INDEX idx_email_logs_action ON public.email_logs (action);
CREATE INDEX idx_email_logs_user ON public.email_logs (user_id);
CREATE INDEX idx_email_logs_company ON public.email_logs (company_id);

-- ============================================================
-- Triggers for updated_at
-- ============================================================
CREATE TRIGGER set_email_provider_updated_at
  BEFORE UPDATE ON public.email_provider_settings
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_email_queue_updated_at
  BEFORE UPDATE ON public.email_queue
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_user_email_prefs_updated_at
  BEFORE UPDATE ON public.user_email_preferences
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
