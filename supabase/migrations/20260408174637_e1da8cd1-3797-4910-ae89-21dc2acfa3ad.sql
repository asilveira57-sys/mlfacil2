
-- 1. Backfill: create company_users rows for all companies where user_id exists but no company_users row
INSERT INTO company_users (company_id, user_id, profile_id, is_owner, status)
SELECT 
  c.id,
  c.user_id,
  (SELECT id FROM access_profiles WHERE key = 'owner' AND is_system = true LIMIT 1),
  true,
  'active'
FROM companies c
WHERE c.user_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM company_users cu 
  WHERE cu.company_id = c.id AND cu.user_id = c.user_id
)
ON CONFLICT DO NOTHING;

-- 2. Trigger: auto-create company_users when a company is created with a user_id
CREATE OR REPLACE FUNCTION public.auto_create_company_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    INSERT INTO company_users (company_id, user_id, profile_id, is_owner, status)
    VALUES (
      NEW.id,
      NEW.user_id,
      (SELECT id FROM access_profiles WHERE key = 'owner' AND is_system = true LIMIT 1),
      true,
      'active'
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_company_user ON companies;
CREATE TRIGGER trg_auto_create_company_user
  AFTER INSERT ON companies
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_company_user();
