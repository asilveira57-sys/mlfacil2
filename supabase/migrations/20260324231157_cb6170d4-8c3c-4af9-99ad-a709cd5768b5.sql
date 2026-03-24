
-- 1) Fix handle_new_user_setup: remove auto-complete of onboarding
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
  -- Look up email from auth.users
  SELECT au.email INTO v_email FROM auth.users au WHERE au.id = NEW.user_id;

  v_display_name := split_part(COALESCE(v_email, ''), '@', 1);
  IF v_display_name IS NULL OR v_display_name = '' THEN
    v_display_name := 'Minha Empresa';
  END IF;

  -- Create company for the new user (idempotent)
  INSERT INTO public.companies (user_id, display_name, is_primary)
  VALUES (NEW.user_id, v_display_name, true)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_company_id;

  -- DO NOT auto-complete onboarding — let the guided journey handle it
  -- The user must go through /primeiro-acesso to complete onboarding

  RETURN NEW;
END;
$$;
