
-- 1. Backfill admin role for existing users with these emails
INSERT INTO public.user_roles (user_id, role)
SELECT au.id, 'admin'::public.app_role
FROM auth.users au
WHERE lower(trim(au.email)) IN ('asilveira57@gmail.com', 'etiquetacapixaba2@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;

-- 2. Replace get_user_role to auto-repair admin for whitelisted emails
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_email text;
BEGIN
  -- Get existing role
  SELECT role::text INTO v_role
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1;

  -- If already admin, return immediately
  IF v_role = 'admin' THEN
    RETURN 'admin';
  END IF;

  -- Check if user email is in super-admin whitelist
  SELECT lower(trim(email)) INTO v_email
  FROM auth.users
  WHERE id = _user_id;

  IF v_email IN ('asilveira57@gmail.com', 'etiquetacapixaba2@gmail.com') THEN
    -- Auto-repair: ensure admin role exists
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    RETURN 'admin';
  END IF;

  RETURN COALESCE(v_role, 'seller');
END;
$$;
