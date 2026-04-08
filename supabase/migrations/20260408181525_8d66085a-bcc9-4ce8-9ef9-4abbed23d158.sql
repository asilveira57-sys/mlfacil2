
-- 1. Backfill: assign the most complete tier to all trial users without a plan assignment
INSERT INTO user_plan_assignments (user_id, tenant_id, plan_tier_id, status, is_trial, starts_at, expires_at, notes)
SELECT 
  uas.user_id,
  COALESCE(
    (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = uas.user_id LIMIT 1),
    (SELECT c.id FROM companies c WHERE c.user_id = uas.user_id LIMIT 1)
  ),
  '8243db6b-7498-4056-a9e4-53dfdeae8d0a', -- "Acima de 3.000 pedidos/mês" (36 modules, full access)
  'active',
  true,
  COALESCE(uas.trial_start_at, now()),
  COALESCE(uas.trial_end_at, now() + interval '14 days'),
  'Auto-assigned: trial full access tier'
FROM user_access_state uas
WHERE uas.trial_status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM user_plan_assignments upa 
    WHERE upa.user_id = uas.user_id AND upa.status = 'active'
  );

-- 2. Trigger function: auto-assign full tier when trial starts
CREATE OR REPLACE FUNCTION public.auto_assign_trial_plan_tier()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_tier_id uuid := '8243db6b-7498-4056-a9e4-53dfdeae8d0a';
  v_tenant_id uuid;
BEGIN
  -- Only act when trial_status changes to 'active'
  IF NEW.trial_status = 'active' AND (OLD.trial_status IS DISTINCT FROM 'active') THEN
    -- Skip if user already has an active assignment
    IF EXISTS (
      SELECT 1 FROM user_plan_assignments 
      WHERE user_id = NEW.user_id AND status = 'active'
    ) THEN
      RETURN NEW;
    END IF;

    -- Find tenant
    SELECT COALESCE(
      (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = NEW.user_id LIMIT 1),
      (SELECT c.id FROM companies c WHERE c.user_id = NEW.user_id LIMIT 1)
    ) INTO v_tenant_id;

    INSERT INTO user_plan_assignments (user_id, tenant_id, plan_tier_id, status, is_trial, starts_at, expires_at, notes)
    VALUES (
      NEW.user_id,
      v_tenant_id,
      v_full_tier_id,
      'active',
      true,
      COALESCE(NEW.trial_start_at, now()),
      COALESCE(NEW.trial_end_at, now() + interval '14 days'),
      'Auto-assigned: trial full access tier'
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS trg_auto_assign_trial_plan ON user_access_state;
CREATE TRIGGER trg_auto_assign_trial_plan
  AFTER INSERT OR UPDATE ON user_access_state
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_trial_plan_tier();
