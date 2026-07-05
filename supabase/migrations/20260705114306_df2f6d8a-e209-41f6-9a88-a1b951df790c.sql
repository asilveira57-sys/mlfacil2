
-- Deterministic rule: Veterano/Full tier overrides ZPL as primary plan.
-- Whenever a non-zpl tier entitlement is active for a tenant, any active
-- zpl tier entitlement for the same tenant is automatically cancelled.

CREATE OR REPLACE FUNCTION public.enforce_veterano_over_zpl(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_primary boolean;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_entitlements te
    JOIN public.plan_tiers pt ON pt.id = te.tier_id
    WHERE te.tenant_id = p_tenant_id
      AND te.entitlement_type = 'tier'
      AND te.status = 'active'
      AND COALESCE(pt.plan_group, '') <> 'zpl'
      AND (te.current_period_end IS NULL OR te.current_period_end > now())
  ) INTO v_has_primary;

  IF v_has_primary THEN
    UPDATE public.tenant_entitlements te
    SET status = 'cancelled',
        auto_renew = false,
        updated_at = now(),
        source = COALESCE(source, '') || CASE
          WHEN source IS NULL OR source = '' THEN 'auto_cancelled_by_veterano_priority'
          ELSE '|auto_cancelled_by_veterano_priority'
        END
    FROM public.plan_tiers pt
    WHERE pt.id = te.tier_id
      AND te.tenant_id = p_tenant_id
      AND te.entitlement_type = 'tier'
      AND te.status = 'active'
      AND pt.plan_group = 'zpl';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_enforce_veterano_over_zpl()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.entitlement_type = 'tier' AND NEW.status = 'active' THEN
    PERFORM public.enforce_veterano_over_zpl(NEW.tenant_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_veterano_over_zpl_ins ON public.tenant_entitlements;
DROP TRIGGER IF EXISTS enforce_veterano_over_zpl_upd ON public.tenant_entitlements;

CREATE TRIGGER enforce_veterano_over_zpl_ins
AFTER INSERT ON public.tenant_entitlements
FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_veterano_over_zpl();

CREATE TRIGGER enforce_veterano_over_zpl_upd
AFTER UPDATE OF status, tier_id, current_period_end ON public.tenant_entitlements
FOR EACH ROW
WHEN (NEW.status = 'active' AND NEW.entitlement_type = 'tier')
EXECUTE FUNCTION public.trg_enforce_veterano_over_zpl();

-- Backfill: apply rule to every tenant that currently has both active
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT te.tenant_id
    FROM public.tenant_entitlements te
    JOIN public.plan_tiers pt ON pt.id = te.tier_id
    WHERE te.entitlement_type = 'tier'
      AND te.status = 'active'
      AND COALESCE(pt.plan_group,'') <> 'zpl'
  LOOP
    PERFORM public.enforce_veterano_over_zpl(r.tenant_id);
  END LOOP;
END $$;
