CREATE OR REPLACE FUNCTION public.activate_own_collaborator_invites()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_count integer := 0;
  r record;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT lower(trim(email)) INTO v_email
  FROM auth.users
  WHERE id = v_user_id;

  IF v_email IS NULL THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT id
    FROM public.collaborators
    WHERE lower(trim(email)) = v_email
      AND deleted_at IS NULL
      AND status IN ('invited', 'active')
  LOOP
    UPDATE public.collaborators
    SET auth_user_id = v_user_id,
        status = 'active',
        accepted_at = COALESCE(accepted_at, now()),
        disabled_at = NULL,
        updated_at = now()
    WHERE id = r.id;

    v_count := v_count + 1;
  END LOOP;

  PERFORM public.sync_collaborator_context(v_user_id);
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_own_collaborator_invites() TO authenticated;