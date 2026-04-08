
-- RPC: admin can reset onboarding for a single user
CREATE OR REPLACE FUNCTION public.admin_reset_onboarding(p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check caller is admin
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_admin');
  END IF;

  -- Reset onboarding status
  UPDATE public.user_access_state
  SET 
    onboarding_status = 'pending',
    updated_at = now()
  WHERE user_id = p_target_user_id;

  IF NOT FOUND THEN
    -- Create the row if it doesn't exist
    INSERT INTO public.user_access_state (user_id, onboarding_status)
    VALUES (p_target_user_id, 'pending')
    ON CONFLICT (user_id) DO UPDATE SET onboarding_status = 'pending', updated_at = now();
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- RPC: admin can bulk-reset onboarding for veterans without ML connected
CREATE OR REPLACE FUNCTION public.admin_bulk_reset_onboarding()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_admin');
  END IF;

  UPDATE public.user_access_state uas
  SET onboarding_status = 'pending', updated_at = now()
  WHERE uas.onboarding_status = 'completed'
    AND (uas.ml_account_connected IS NOT TRUE)
    AND EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = uas.user_id AND p.tag = 'VETERANO'
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'reset_count', v_count);
END;
$$;
