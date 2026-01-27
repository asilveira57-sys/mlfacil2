-- =============================================
-- SISTEMA DE NOTIFICAÇÕES PREMIUM - MKTPFACIL
-- Snooze, Quick Actions, Priority System
-- =============================================

-- Add snooze columns to app_notifications if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'app_notifications' 
                 AND column_name = 'is_snoozed') THEN
    ALTER TABLE public.app_notifications 
      ADD COLUMN is_snoozed boolean DEFAULT false,
      ADD COLUMN snooze_until timestamptz,
      ADD COLUMN snoozed_at timestamptz,
      ADD COLUMN resolved_at timestamptz,
      ADD COLUMN resolved_by uuid REFERENCES auth.users(id);
  END IF;
END $$;

-- Add origin_module column to track source
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'app_notifications' 
                 AND column_name = 'origin_module') THEN
    ALTER TABLE public.app_notifications 
      ADD COLUMN origin_module text DEFAULT 'system';
  END IF;
END $$;

-- Create index for priority ordering
CREATE INDEX IF NOT EXISTS idx_app_notifications_priority_order 
  ON public.app_notifications (user_id, is_dismissed, is_read, priority DESC, created_at DESC);

-- Create index for snooze queries
CREATE INDEX IF NOT EXISTS idx_app_notifications_snooze 
  ON public.app_notifications (user_id, is_snoozed, snooze_until) 
  WHERE is_snoozed = true;

-- Create index for active notifications (non-dismissed, non-snoozed)
CREATE INDEX IF NOT EXISTS idx_app_notifications_active 
  ON public.app_notifications (user_id, is_dismissed, is_snoozed, created_at DESC)
  WHERE is_dismissed = false;

-- =============================================
-- NOTIFICATION AUDIT LOG
-- =============================================

CREATE TABLE IF NOT EXISTS public.notification_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid REFERENCES public.app_notifications(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  action text NOT NULL, -- 'created', 'read', 'dismissed', 'snoozed', 'resolved', 'unsnoozed'
  action_details jsonb DEFAULT '{}',
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notification_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own audit logs"
  ON public.notification_audit_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert audit logs"
  ON public.notification_audit_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Index for audit log
CREATE INDEX IF NOT EXISTS idx_notification_audit_user 
  ON public.notification_audit_log (user_id, created_at DESC);

-- =============================================
-- NOTIFICATION PREFERENCES
-- =============================================

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Category preferences (enabled by default)
  qa_pending_enabled boolean DEFAULT true,
  qa_sla_warning_enabled boolean DEFAULT true,
  qa_sla_breached_enabled boolean DEFAULT true,
  qa_blocked_enabled boolean DEFAULT true,
  qa_send_error_enabled boolean DEFAULT true,
  post_sale_blocked_enabled boolean DEFAULT true,
  post_sale_error_enabled boolean DEFAULT true,
  system_alert_enabled boolean DEFAULT true,
  
  -- Delivery preferences
  show_in_bell boolean DEFAULT true,
  show_in_dashboard boolean DEFAULT true,
  
  -- Quiet hours
  quiet_hours_enabled boolean DEFAULT false,
  quiet_hours_start time,
  quiet_hours_end time,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(user_id, workspace_id)
);

-- Enable RLS
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own preferences"
  ON public.notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own preferences"
  ON public.notification_preferences FOR ALL
  USING (auth.uid() = user_id);

-- =============================================
-- PRIORITY DASHBOARD ITEMS VIEW
-- =============================================

CREATE OR REPLACE VIEW public.priority_notifications AS
SELECT 
  n.*,
  -- Calculate priority score for ordering
  CASE 
    WHEN n.priority = 'urgent' THEN 100
    WHEN n.priority = 'high' THEN 75
    WHEN n.priority = 'normal' THEN 50
    WHEN n.priority = 'low' THEN 25
    ELSE 50
  END +
  CASE 
    WHEN n.category IN ('qa_sla_breached', 'qa_blocked', 'post_sale_blocked') THEN 50
    WHEN n.category IN ('qa_sla_warning', 'qa_send_error', 'post_sale_error') THEN 30
    ELSE 0
  END +
  -- Age factor (older = higher priority)
  LEAST(EXTRACT(EPOCH FROM (now() - n.created_at)) / 3600, 48) AS priority_score
FROM public.app_notifications n
WHERE n.is_dismissed = false 
  AND (n.is_snoozed = false OR n.snooze_until < now())
  AND n.is_actioned = false
ORDER BY priority_score DESC, n.created_at DESC;

-- Function to auto-unsnooze notifications
CREATE OR REPLACE FUNCTION public.check_snoozed_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.app_notifications
  SET 
    is_snoozed = false,
    snooze_until = NULL
  WHERE is_snoozed = true 
    AND snooze_until IS NOT NULL 
    AND snooze_until <= now();
END;
$$;

-- Function to snooze a notification
CREATE OR REPLACE FUNCTION public.snooze_notification(
  p_notification_id uuid,
  p_snooze_hours int DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snooze_until timestamptz;
BEGIN
  v_snooze_until := now() + (p_snooze_hours || ' hours')::interval;
  
  UPDATE public.app_notifications
  SET 
    is_snoozed = true,
    snooze_until = v_snooze_until,
    snoozed_at = now()
  WHERE id = p_notification_id 
    AND user_id = auth.uid();
    
  -- Log the action
  INSERT INTO public.notification_audit_log (notification_id, user_id, action, action_details)
  VALUES (p_notification_id, auth.uid(), 'snoozed', jsonb_build_object('snooze_hours', p_snooze_hours, 'snooze_until', v_snooze_until));
END;
$$;

-- Function to resolve a notification (mark as actioned)
CREATE OR REPLACE FUNCTION public.resolve_notification(p_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.app_notifications
  SET 
    is_actioned = true,
    resolved_at = now(),
    resolved_by = auth.uid(),
    is_read = true,
    read_at = COALESCE(read_at, now())
  WHERE id = p_notification_id 
    AND user_id = auth.uid();
    
  -- Log the action
  INSERT INTO public.notification_audit_log (notification_id, user_id, action)
  VALUES (p_notification_id, auth.uid(), 'resolved');
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.snooze_notification TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_notification TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_snoozed_notifications TO authenticated;