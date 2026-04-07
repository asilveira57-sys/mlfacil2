
-- Drop and recreate get_admin_dashboard_stats with correct tables
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_users bigint;
  v_trial_users bigint;
  v_active_subscriptions bigint;
  v_expired_subscriptions bigint;
  v_pending_webhooks bigint;
  v_recent_signups bigint;
  v_trials_expiring bigint;
BEGIN
  -- Total users from auth.users
  SELECT COUNT(*) INTO v_total_users FROM auth.users;

  -- Trial users (trial_status = 'active' AND payment_status = 'trial')
  SELECT COUNT(*) INTO v_trial_users
  FROM public.user_access_state
  WHERE trial_status = 'active' AND payment_status = 'trial';

  -- Active subscriptions (payment_status = 'active')
  SELECT COUNT(*) INTO v_active_subscriptions
  FROM public.user_access_state
  WHERE payment_status = 'active';

  -- Expired (trial expired and not paying)
  SELECT COUNT(*) INTO v_expired_subscriptions
  FROM public.user_access_state
  WHERE trial_status = 'expired' AND payment_status NOT IN ('active');

  -- Pending webhooks from webhook_events
  SELECT COUNT(*) INTO v_pending_webhooks
  FROM public.webhook_events
  WHERE processed_at IS NULL;

  -- Recent signups (7 days)
  SELECT COUNT(*) INTO v_recent_signups
  FROM auth.users
  WHERE created_at >= now() - interval '7 days';

  -- Trials expiring in next 7 days
  SELECT COUNT(*) INTO v_trials_expiring
  FROM public.user_access_state
  WHERE trial_status = 'active'
    AND trial_end_at IS NOT NULL
    AND trial_end_at <= now() + interval '7 days'
    AND trial_end_at > now();

  RETURN jsonb_build_object(
    'total_users', v_total_users,
    'trial_users', v_trial_users,
    'active_subscriptions', v_active_subscriptions,
    'expired_subscriptions', v_expired_subscriptions,
    'pending_webhooks', v_pending_webhooks,
    'recent_signups_7d', v_recent_signups,
    'trials_expiring_soon', v_trials_expiring
  );
END;
$$;

-- Create get_admin_webhook_logs RPC
CREATE OR REPLACE FUNCTION public.get_admin_webhook_logs(p_limit int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      id,
      COALESCE(topic, provider, 'unknown') as event_type,
      payload_raw as payload,
      processed_at,
      last_error as error_message,
      COALESCE(received_at, created_at) as created_at
    FROM public.webhook_events
    ORDER BY created_at DESC
    LIMIT p_limit
  ) t;

  RETURN v_result;
END;
$$;
