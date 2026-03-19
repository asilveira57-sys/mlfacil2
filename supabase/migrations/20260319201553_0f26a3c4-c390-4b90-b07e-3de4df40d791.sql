-- Fix get_or_create_user_access_state to check if welcome flow was already completed
CREATE OR REPLACE FUNCTION public.get_or_create_user_access_state(p_user_id UUID)
RETURNS public.user_access_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.user_access_state;
  v_ml_account RECORD;
  v_company RECORD;
  v_onboarding_done BOOLEAN;
BEGIN
  -- Tentar buscar estado existente
  SELECT * INTO v_state FROM public.user_access_state WHERE user_id = p_user_id;
  
  -- Se não existe, criar
  IF v_state IS NULL THEN
    -- Check if the welcome onboarding flow was already completed
    SELECT EXISTS(
      SELECT 1 FROM public.onboarding_user_progress
      WHERE user_id = p_user_id AND status = 'completed'
    ) INTO v_onboarding_done;

    INSERT INTO public.user_access_state (
      user_id,
      onboarding_status,
      trial_status,
      payment_status
    ) VALUES (
      p_user_id,
      CASE WHEN v_onboarding_done THEN 'completed'::onboarding_status ELSE 'pending'::onboarding_status END,
      'none',
      'free'::payment_status
    )
    RETURNING * INTO v_state;
  ELSE
    -- If state exists but onboarding is still pending, check if welcome flow was completed
    IF v_state.onboarding_status = 'pending' THEN
      SELECT EXISTS(
        SELECT 1 FROM public.onboarding_user_progress
        WHERE user_id = p_user_id AND status = 'completed'
      ) INTO v_onboarding_done;

      IF v_onboarding_done THEN
        UPDATE public.user_access_state
        SET onboarding_status = 'completed', updated_at = now()
        WHERE user_id = p_user_id
        RETURNING * INTO v_state;
      END IF;
    END IF;
  END IF;
  
  -- Atualizar info de conta ML se existir
  SELECT id, is_active INTO v_ml_account 
  FROM public.ml_accounts 
  WHERE user_id = p_user_id AND is_active = true
  LIMIT 1;
  
  IF v_ml_account.id IS NOT NULL THEN
    UPDATE public.user_access_state 
    SET 
      ml_account_connected = true,
      ml_account_id = v_ml_account.id,
      ml_account_role = 'owner',
      updated_at = now()
    WHERE user_id = p_user_id
    RETURNING * INTO v_state;
  END IF;
  
  -- Sincronizar trial da company se existir
  SELECT * INTO v_company 
  FROM public.companies 
  WHERE user_id = p_user_id AND is_active = true 
  LIMIT 1;

  IF v_company IS NOT NULL AND v_company.trial_started_at IS NOT NULL THEN
    IF v_company.trial_ends_at < now() THEN
      UPDATE public.user_access_state
      SET 
        trial_status = 'expired',
        trial_start_at = v_company.trial_started_at,
        trial_end_at = v_company.trial_ends_at,
        payment_status = (CASE 
          WHEN payment_status::text IN ('active') THEN payment_status 
          ELSE 'blocked'::payment_status
        END),
        updated_at = now()
      WHERE user_id = p_user_id
      RETURNING * INTO v_state;
    ELSE
      UPDATE public.user_access_state
      SET 
        trial_status = 'active',
        trial_start_at = v_company.trial_started_at,
        trial_end_at = v_company.trial_ends_at,
        payment_status = (CASE
          WHEN payment_status::text = 'active' THEN 'active'::payment_status
          ELSE 'trial'::payment_status
        END),
        updated_at = now()
      WHERE user_id = p_user_id
      RETURNING * INTO v_state;
    END IF;
  END IF;
  
  RETURN v_state;
END;
$$;