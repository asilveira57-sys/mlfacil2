-- Fix handle_new_user_setup trigger: user_access_state has no 'email' column
-- Must look up email from auth.users instead of NEW.email
CREATE OR REPLACE FUNCTION public.handle_new_user_setup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_display_name text;
  v_email text;
BEGIN
  -- Look up email from auth.users since user_access_state has no email column
  SELECT au.email INTO v_email FROM auth.users au WHERE au.id = NEW.user_id;
  
  v_display_name := split_part(COALESCE(v_email, ''), '@', 1);
  IF v_display_name IS NULL OR v_display_name = '' THEN
    v_display_name := 'Minha Empresa';
  END IF;

  -- Create company for the new user
  INSERT INTO public.companies (user_id, display_name, is_primary)
  VALUES (NEW.user_id, v_display_name, true)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_company_id;

  -- Mark onboarding as completed so ProtectedRoute doesn't block
  UPDATE public.user_access_state
  SET onboarding_status = 'completed',
      onboarding_completed_at = now(),
      updated_at = now()
  WHERE user_id = NEW.user_id
    AND onboarding_status = 'pending';

  RETURN NEW;
END;
$$;

-- Now fix existing sellers: insert user_access_state for those with ml_accounts but no row
INSERT INTO public.user_access_state (user_id, onboarding_status, ml_account_connected)
SELECT DISTINCT ma.user_id, 'completed'::onboarding_status, true
FROM public.ml_accounts ma
LEFT JOIN public.user_access_state uas ON uas.user_id = ma.user_id
WHERE uas.user_id IS NULL
ON CONFLICT (user_id) DO UPDATE SET onboarding_status = 'completed';

-- Fix existing rows that have ml_accounts but onboarding not completed
UPDATE public.user_access_state
SET onboarding_status = 'completed'
WHERE user_id IN (
  SELECT DISTINCT ma.user_id FROM public.ml_accounts ma
)
AND onboarding_status != 'completed';