
-- Trigger: when an active 'tier' entitlement is created/updated,
-- ensure the user_access_state shows payment_status='active' for all
-- members of the tenant (and the owner). This prevents the "trial expired"
-- gate from blocking paid customers.
CREATE OR REPLACE FUNCTION public.sync_payment_status_from_entitlement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.entitlement_type = 'tier' AND NEW.status = 'active' THEN
    UPDATE public.user_access_state uas
    SET payment_status = 'active',
        updated_at = now()
    FROM public.tenant_members tm
    WHERE tm.tenant_id = NEW.tenant_id
      AND uas.user_id = tm.user_id
      AND uas.payment_status::text <> 'active';

    UPDATE public.user_access_state uas
    SET payment_status = 'active',
        updated_at = now()
    FROM public.tenants t
    WHERE t.id = NEW.tenant_id
      AND uas.user_id = t.owner_user_id
      AND uas.payment_status::text <> 'active';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_payment_status_from_entitlement ON public.tenant_entitlements;
CREATE TRIGGER trg_sync_payment_status_from_entitlement
AFTER INSERT OR UPDATE OF status ON public.tenant_entitlements
FOR EACH ROW
EXECUTE FUNCTION public.sync_payment_status_from_entitlement();

-- Backfill: align payment_status for all users with active 'tier' entitlements
UPDATE public.user_access_state uas
SET payment_status = 'active', updated_at = now()
FROM public.tenant_entitlements te
JOIN public.tenant_members tm ON tm.tenant_id = te.tenant_id
WHERE uas.user_id = tm.user_id
  AND te.entitlement_type = 'tier'
  AND te.status = 'active'
  AND uas.payment_status::text <> 'active';

UPDATE public.user_access_state uas
SET payment_status = 'active', updated_at = now()
FROM public.tenant_entitlements te
JOIN public.tenants t ON t.id = te.tenant_id
WHERE uas.user_id = t.owner_user_id
  AND te.entitlement_type = 'tier'
  AND te.status = 'active'
  AND uas.payment_status::text <> 'active';
