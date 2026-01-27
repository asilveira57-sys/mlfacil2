
-- =============================================
-- COMMUNICATION SAFETY LAYER (SHARED)
-- =============================================

-- Rename post_sale_blocked_patterns to shared table
ALTER TABLE IF EXISTS post_sale_blocked_patterns RENAME TO communication_blocked_patterns;

-- Add channel column to track which modules use each pattern
ALTER TABLE communication_blocked_patterns 
ADD COLUMN IF NOT EXISTS channels text[] DEFAULT ARRAY['post_sale', 'qa'];

-- =============================================
-- Q&A MODULE TABLES
-- =============================================

-- Question status enum
CREATE TYPE qa_question_status AS ENUM (
  'pending',      -- Not answered
  'answered',     -- Has response
  'draft',        -- Response in progress
  'archived',     -- Archived/ignored
  'blocked'       -- Response was blocked
);

-- Response source enum
CREATE TYPE qa_response_source AS ENUM (
  'manual',       -- Typed by user
  'library',      -- From approved library
  'ai_suggested', -- AI generated (approved)
  'ai_edited'     -- AI generated then edited
);

-- Risk level enum
CREATE TYPE qa_risk_level AS ENUM (
  'low',
  'medium',
  'high'
);

-- Response library categories
CREATE TABLE qa_response_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  seller_id text NOT NULL,
  name text NOT NULL,
  description text,
  color text DEFAULT '#6366f1',
  icon text DEFAULT 'message-square',
  sort_order int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(seller_id, name)
);

-- Response library (approved responses)
CREATE TABLE qa_response_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  seller_id text NOT NULL,
  category_id uuid REFERENCES qa_response_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  content text NOT NULL,
  shortcut text, -- Quick insert shortcut like /frete
  tags text[] DEFAULT '{}',
  usage_count int DEFAULT 0,
  is_approved boolean DEFAULT true,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Questions from marketplace
CREATE TABLE qa_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  seller_id text NOT NULL,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  
  -- ML data
  ml_question_id text NOT NULL,
  ml_item_id text NOT NULL,
  ml_buyer_id text,
  
  -- Content
  question_text text NOT NULL,
  item_title text,
  item_sku text,
  item_variation text,
  item_thumbnail text,
  
  -- Status and classification
  status qa_question_status DEFAULT 'pending',
  risk_level qa_risk_level DEFAULT 'low',
  risk_reasons text[] DEFAULT '{}',
  category text, -- frete, compatibilidade, uso, garantia, nota_fiscal, etc
  
  -- Timing
  question_date timestamptz NOT NULL,
  answered_at timestamptz,
  sla_deadline timestamptz,
  is_sla_breached boolean DEFAULT false,
  
  -- Flags
  needs_attention boolean DEFAULT false,
  is_snoozed boolean DEFAULT false,
  snooze_until timestamptz,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(seller_id, ml_question_id)
);

-- Responses to questions
CREATE TABLE qa_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  seller_id text NOT NULL,
  question_id uuid NOT NULL REFERENCES qa_questions(id) ON DELETE CASCADE,
  
  -- Content
  response_text text NOT NULL,
  source qa_response_source NOT NULL,
  library_response_id uuid REFERENCES qa_response_library(id) ON DELETE SET NULL,
  
  -- AI tracking
  ai_original_text text, -- Original AI suggestion if edited
  ai_model text,
  
  -- Validation
  validation_passed boolean,
  validation_errors text[] DEFAULT '{}',
  
  -- Status
  is_draft boolean DEFAULT false,
  is_sent boolean DEFAULT false,
  sent_at timestamptz,
  ml_response_id text, -- ID from ML after sending
  
  -- Error tracking
  send_error text,
  retry_count int DEFAULT 0,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Complete audit trail
CREATE TABLE qa_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  seller_id text NOT NULL,
  question_id uuid REFERENCES qa_questions(id) ON DELETE SET NULL,
  response_id uuid REFERENCES qa_responses(id) ON DELETE SET NULL,
  
  action text NOT NULL, -- view, draft_created, draft_edited, sent, blocked, archived, etc
  actor_id uuid NOT NULL, -- Who performed the action
  
  -- Snapshot data
  question_text text,
  response_text text,
  response_source qa_response_source,
  
  -- Validation data
  validation_result jsonb,
  block_reasons text[],
  
  -- Metadata
  metadata jsonb DEFAULT '{}',
  ip_address text,
  user_agent text,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================
-- NOTIFICATION CENTER (ENHANCED)
-- =============================================

-- Notification types enum
CREATE TYPE notification_priority AS ENUM (
  'low',
  'normal',
  'high',
  'urgent'
);

-- Notification categories
CREATE TYPE notification_category AS ENUM (
  'qa_pending',           -- Question waiting response
  'qa_sla_warning',       -- SLA about to breach
  'qa_sla_breached',      -- SLA breached
  'qa_blocked',           -- Response blocked by validator
  'qa_send_error',        -- Failed to send response
  'post_sale_blocked',    -- Post-sale message blocked
  'post_sale_error',      -- Post-sale send error
  'system_alert',         -- System notifications
  'task_assigned',        -- Task assignment
  'promotion_alert'       -- Promotion alerts
);

-- Enhanced notifications table
CREATE TABLE app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  seller_id text,
  
  -- Content
  category notification_category NOT NULL,
  priority notification_priority DEFAULT 'normal',
  title text NOT NULL,
  body text,
  
  -- Reference
  reference_type text, -- 'question', 'message', 'order', etc
  reference_id text,   -- ID of the related entity
  action_url text,     -- Deep link to the item
  
  -- Grouping
  group_key text,      -- For grouping similar notifications
  
  -- Status
  is_read boolean DEFAULT false,
  is_dismissed boolean DEFAULT false,
  is_actioned boolean DEFAULT false, -- User took action
  
  -- Timing
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  expires_at timestamptz,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'
);

-- Daily metrics for dashboard
CREATE TABLE qa_daily_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  seller_id text NOT NULL,
  metric_date date NOT NULL,
  
  questions_received int DEFAULT 0,
  questions_answered int DEFAULT 0,
  questions_pending int DEFAULT 0,
  questions_blocked int DEFAULT 0,
  
  avg_response_time_minutes int,
  sla_breaches int DEFAULT 0,
  
  responses_from_library int DEFAULT 0,
  responses_from_ai int DEFAULT 0,
  responses_manual int DEFAULT 0,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(seller_id, metric_date)
);

-- =============================================
-- INDEXES
-- =============================================

CREATE INDEX idx_qa_questions_seller_status ON qa_questions(seller_id, status);
CREATE INDEX idx_qa_questions_seller_pending ON qa_questions(seller_id) WHERE status = 'pending';
CREATE INDEX idx_qa_questions_sla ON qa_questions(seller_id, sla_deadline) WHERE NOT is_sla_breached AND status = 'pending';
CREATE INDEX idx_qa_questions_risk ON qa_questions(seller_id, risk_level) WHERE status = 'pending';
CREATE INDEX idx_qa_responses_question ON qa_responses(question_id);
CREATE INDEX idx_qa_response_library_seller ON qa_response_library(seller_id) WHERE is_active;
CREATE INDEX idx_qa_audit_question ON qa_audit_log(question_id);
CREATE INDEX idx_app_notifications_user ON app_notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_app_notifications_workspace ON app_notifications(workspace_id, is_read) WHERE NOT is_dismissed;

-- =============================================
-- RLS POLICIES
-- =============================================

ALTER TABLE qa_response_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_response_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_daily_metrics ENABLE ROW LEVEL SECURITY;

-- Categories policies
CREATE POLICY "Users can view own categories" ON qa_response_categories
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own categories" ON qa_response_categories
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own categories" ON qa_response_categories
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own categories" ON qa_response_categories
  FOR DELETE USING (auth.uid() = user_id);

-- Library policies
CREATE POLICY "Users can view own library" ON qa_response_library
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own library" ON qa_response_library
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own library" ON qa_response_library
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own library" ON qa_response_library
  FOR DELETE USING (auth.uid() = user_id);

-- Questions policies
CREATE POLICY "Users can view own questions" ON qa_questions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own questions" ON qa_questions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own questions" ON qa_questions
  FOR UPDATE USING (auth.uid() = user_id);

-- Responses policies
CREATE POLICY "Users can view own responses" ON qa_responses
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own responses" ON qa_responses
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own responses" ON qa_responses
  FOR UPDATE USING (auth.uid() = user_id);

-- Audit policies (read only)
CREATE POLICY "Users can view own audit" ON qa_audit_log
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own audit" ON qa_audit_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Notifications policies
CREATE POLICY "Users can view own notifications" ON app_notifications
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON app_notifications
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own notifications" ON app_notifications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Metrics policies
CREATE POLICY "Users can view own metrics" ON qa_daily_metrics
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own metrics" ON qa_daily_metrics
  FOR ALL USING (auth.uid() = user_id);

-- =============================================
-- TRIGGERS
-- =============================================

-- Update timestamps
CREATE TRIGGER update_qa_response_categories_updated_at
  BEFORE UPDATE ON qa_response_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_qa_response_library_updated_at
  BEFORE UPDATE ON qa_response_library
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_qa_questions_updated_at
  BEFORE UPDATE ON qa_questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_qa_responses_updated_at
  BEFORE UPDATE ON qa_responses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_qa_daily_metrics_updated_at
  BEFORE UPDATE ON qa_daily_metrics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE app_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE qa_questions;
