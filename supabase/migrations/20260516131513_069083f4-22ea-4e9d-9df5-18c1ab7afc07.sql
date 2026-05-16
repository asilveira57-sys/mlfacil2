CREATE OR REPLACE FUNCTION public.sync_collaborator_membership_from_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  IF NEW.auth_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.id INTO v_company_id
  FROM public.companies c
  WHERE c.user_id = NEW.created_by
    AND c.is_active = true
  ORDER BY c.is_primary DESC NULLS LAST, c.created_at ASC
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'active' AND NEW.deleted_at IS NULL THEN
    INSERT INTO public.company_users (company_id, user_id, profile_id, is_owner, status, created_at, updated_at)
    VALUES (v_company_id, NEW.auth_user_id, NEW.profile_id, false, 'active', now(), now())
    ON CONFLICT (company_id, user_id) DO UPDATE SET
      profile_id = EXCLUDED.profile_id,
      is_owner = false,
      status = 'active',
      updated_at = now();

    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (NEW.workspace_id, NEW.auth_user_id, 'operador')
    ON CONFLICT (workspace_id, user_id) DO UPDATE SET
      role = EXCLUDED.role;

    PERFORM public.sync_collaborator_context(NEW.auth_user_id);
  ELSE
    UPDATE public.company_users
    SET status = 'disabled', updated_at = now()
    WHERE company_id = v_company_id
      AND user_id = NEW.auth_user_id
      AND is_owner = false;

    DELETE FROM public.workspace_members
    WHERE workspace_id = NEW.workspace_id
      AND user_id = NEW.auth_user_id
      AND role <> 'admin';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_collaborator_membership ON public.collaborators;
CREATE TRIGGER trg_sync_collaborator_membership
AFTER INSERT OR UPDATE OF auth_user_id, status, profile_id, deleted_at ON public.collaborators
FOR EACH ROW
EXECUTE FUNCTION public.sync_collaborator_membership_from_row();