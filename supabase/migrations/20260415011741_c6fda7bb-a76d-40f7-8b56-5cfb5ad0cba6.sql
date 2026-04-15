
-- PART 1: Fix data — restore onboarding for users affected by bulk reset on 2026-04-13
-- and for any user with clear usage signals still stuck as 'pending'
UPDATE public.user_access_state
SET onboarding_status = 'completed', updated_at = now()
WHERE onboarding_status = 'pending'
  AND (
    -- Users affected by the bulk reset on April 13
    updated_at BETWEEN '2026-04-13 21:01:00+00' AND '2026-04-13 21:02:00+00'
    -- Users with ML connected
    OR ml_account_connected = true
    -- Users with active companies
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.user_id = user_access_state.user_id AND c.is_active = true)
  );

-- PART 2: Improve auto-heal in get_or_create_user_access_state
-- Now also checks ML accounts and active companies as onboarding completion signals
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
  v_has_usage_signals BOOLEAN;
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

    -- Also check for usage signals (ML account or active company)
    IF NOT v_onboarding_done THEN
      SELECT (
        EXISTS(SELECT 1 FROM public.ml_accounts WHERE user_id = p_user_id AND is_active = true)
        OR EXISTS(SELECT 1 FROM public.companies WHERE user_id = p_user_id AND is_active = true)
      ) INTO v_has_usage_signals;
      v_onboarding_done := v_has_usage_signals;
    END IF;

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
    -- If state exists but onboarding is still pending, check for completion signals
    IF v_state.onboarding_status = 'pending' THEN
      SELECT EXISTS(
        SELECT 1 FROM public.onboarding_user_progress
        WHERE user_id = p_user_id AND status = 'completed'
      ) INTO v_onboarding_done;

      -- NEW: also check ML accounts and active companies as completion signals
      IF NOT v_onboarding_done THEN
        SELECT (
          EXISTS(SELECT 1 FROM public.ml_accounts WHERE user_id = p_user_id AND is_active = true)
          OR EXISTS(SELECT 1 FROM public.companies WHERE user_id = p_user_id AND is_active = true)
        ) INTO v_has_usage_signals;
        v_onboarding_done := v_has_usage_signals;
      END IF;

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

-- PART 3: Drop the dangerous bulk reset function
DROP FUNCTION IF EXISTS public.admin_bulk_reset_onboarding();
