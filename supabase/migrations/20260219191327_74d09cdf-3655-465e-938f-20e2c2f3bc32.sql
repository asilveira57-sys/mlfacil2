
CREATE OR REPLACE FUNCTION public.get_or_create_user_access_state(p_user_id uuid)
 RETURNS user_access_state
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_state public.user_access_state;
  v_ml_account RECORD;
  v_company RECORD;
BEGIN
  -- Tentar buscar estado existente
  SELECT * INTO v_state FROM public.user_access_state WHERE user_id = p_user_id;
  
  -- Se não existe, criar SEM trial (trial começa no OAuth)
  IF v_state IS NULL THEN
    INSERT INTO public.user_access_state (
      user_id,
      onboarding_status,
      trial_status,
      payment_status
    ) VALUES (
      p_user_id,
      'pending',
      'none',
      'free'::payment_status
    )
    RETURNING * INTO v_state;
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
    -- Atualizar trial_status baseado na company (source of truth)
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
$function$;
