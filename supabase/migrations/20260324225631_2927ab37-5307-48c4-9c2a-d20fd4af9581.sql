-- Fix the update_onboarding_state RPC to use correct audit log columns

CREATE OR REPLACE FUNCTION public.update_onboarding_state(
  p_status public.onboarding_status DEFAULT NULL,
  p_objective text[] DEFAULT NULL,
  p_print_mode text DEFAULT NULL,
  p_label_size text DEFAULT NULL
)
RETURNS public.user_access_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_state public.user_access_state;
  v_company RECORD;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Garantir que estado existe
  SELECT * INTO v_state FROM public.get_or_create_user_access_state(v_user_id);
  
  -- Atualizar campos fornecidos
  UPDATE public.user_access_state
  SET
    onboarding_status = COALESCE(p_status, onboarding_status),
    onboarding_completed_at = CASE 
      WHEN p_status = 'completed' THEN now() 
      ELSE onboarding_completed_at 
    END,
    onboarding_objective = COALESCE(p_objective, onboarding_objective),
    default_print_mode = COALESCE(p_print_mode, default_print_mode),
    default_label_size = COALESCE(p_label_size, default_label_size),
    updated_at = now()
  WHERE user_id = v_user_id
  RETURNING * INTO v_state;

  -- AUTO-ACTIVATE TRIAL: When onboarding completes and ML is connected,
  -- activate a 14-day trial automatically if no trial was ever started
  IF p_status = 'completed' 
     AND v_state.ml_account_connected = true 
     AND v_state.trial_status = 'none' 
     AND v_state.payment_status NOT IN ('active') THEN
    
    -- Activate trial on user_access_state
    UPDATE public.user_access_state
    SET
      trial_status = 'active',
      trial_start_at = now(),
      trial_end_at = now() + interval '14 days',
      payment_status = 'trial',
      updated_at = now()
    WHERE user_id = v_user_id
    RETURNING * INTO v_state;

    -- Also set trial on the primary company
    SELECT * INTO v_company 
    FROM public.companies 
    WHERE user_id = v_user_id AND is_active = true 
    ORDER BY created_at ASC LIMIT 1;

    IF v_company IS NOT NULL THEN
      UPDATE public.companies
      SET 
        trial_started_at = now(),
        trial_ends_at = now() + interval '14 days',
        trial_status = 'active',
        updated_at = now()
      WHERE id = v_company.id;
    END IF;

    -- Log the auto-activation
    INSERT INTO public.system_audit_log (
      user_id, event_type, event_category, target_id, details
    ) VALUES (
      v_user_id, 
      'TRIAL_AUTO_ACTIVATED', 
      'onboarding',
      v_user_id::text,
      jsonb_build_object(
        'trigger', 'onboarding_completed',
        'trial_days', 14,
        'ml_connected', true,
        'company_id', v_company.id
      )
    );
  END IF;
  
  RETURN v_state;
END;
$$;