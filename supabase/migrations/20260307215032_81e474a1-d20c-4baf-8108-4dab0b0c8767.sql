
-- 1. Function to auto-create tenant when a company is created without one
CREATE OR REPLACE FUNCTION public.ensure_company_has_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF NEW.tenant_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_tenant_id FROM tenants WHERE owner_user_id = NEW.user_id LIMIT 1;

  IF v_tenant_id IS NULL THEN
    INSERT INTO tenants (name, owner_user_id, status, trial_started_at, trial_ends_at, created_at, updated_at)
    VALUES (
      COALESCE(NEW.display_name, 'Minha Empresa'),
      NEW.user_id,
      'active',
      COALESCE(NEW.trial_started_at, now()),
      COALESCE(NEW.trial_ends_at, now() + interval '14 days'),
      now(),
      now()
    )
    RETURNING id INTO v_tenant_id;

    INSERT INTO tenant_members (tenant_id, user_id, role)
    VALUES (v_tenant_id, NEW.user_id, 'owner')
    ON CONFLICT DO NOTHING;
  END IF;

  NEW.tenant_id := v_tenant_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_company_tenant ON companies;
CREATE TRIGGER trg_ensure_company_tenant
  BEFORE INSERT ON companies
  FOR EACH ROW
  EXECUTE FUNCTION ensure_company_has_tenant();

-- 2. Admin RLS policies for retrospective tables
CREATE POLICY "admin_read_all_retrospectives"
  ON retrospectives FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin_read_all_snapshots"
  ON retrospective_snapshots FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin_read_all_targets"
  ON retrospective_targets FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin_delete_retrospectives"
  ON retrospectives FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));
