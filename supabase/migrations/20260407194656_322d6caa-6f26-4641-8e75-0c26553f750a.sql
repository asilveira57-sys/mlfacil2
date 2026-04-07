
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stats jsonb;
BEGIN
  -- Only allow admins
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  SELECT jsonb_build_object(
    'total_users', (SELECT COUNT(*) FROM auth.users),
    'trial_users', (SELECT COUNT(*) FROM public.user_access_state WHERE trial_status = 'active' AND payment_status = 'trial'),
    'active_subscriptions', (SELECT COUNT(*) FROM public.user_access_state WHERE payment_status = 'active'),
    'expired_subscriptions', (SELECT COUNT(*) FROM public.user_access_state WHERE trial_status = 'expired' AND payment_status NOT IN ('active')),
    'pending_webhooks', (SELECT COUNT(*) FROM public.mp_webhook_logs WHERE processed_at IS NULL),
    'recent_signups_7d', (SELECT COUNT(*) FROM auth.users WHERE created_at > now() - interval '7 days'),
    'trials_expiring_soon', (SELECT COUNT(*) FROM public.user_access_state WHERE trial_end_at > now() AND trial_end_at < now() + interval '3 days' AND trial_status = 'active')
  ) INTO v_stats;
  
  RETURN v_stats;
END;
$$;
