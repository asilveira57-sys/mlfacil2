
CREATE OR REPLACE FUNCTION public.admin_set_trial_end_date(
  p_target_user_id uuid,
  p_new_end_date timestamptz,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_end_at timestamptz;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT trial_end_at INTO v_old_end_at
  FROM public.user_access_state
  WHERE user_id = p_target_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  UPDATE public.user_access_state
  SET trial_end_at = p_new_end_date,
      trial_status = CASE WHEN p_new_end_date > now() THEN 'active' ELSE 'expired' END,
      updated_at = now()
  WHERE user_id = p_target_user_id;

  PERFORM public.log_admin_action(
    'trial_date_set',
    'user_access_state',
    p_target_user_id::text,
    jsonb_build_object('trial_end_at', v_old_end_at),
    jsonb_build_object('trial_end_at', p_new_end_date),
    COALESCE(p_reason, 'Trial end date set by admin')
  );

  RETURN jsonb_build_object(
    'success', true,
    'old_end_at', v_old_end_at,
    'new_end_at', p_new_end_date
  );
END;
$$;
