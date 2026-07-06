CREATE OR REPLACE FUNCTION public.get_accessible_ml_accounts()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  ml_user_id text,
  nickname text,
  email text,
  country_id text,
  company_id uuid,
  is_active boolean,
  is_connected boolean,
  connection_status text,
  token_expires_at timestamptz,
  last_api_ok_at timestamptz,
  last_api_error_code text,
  last_api_error_at timestamptz,
  consecutive_failures integer,
  created_at timestamptz,
  updated_at timestamptz,
  is_inherited boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH active_collab AS (
    SELECT
      col.created_by,
      cu.company_id AS member_company_id,
      uc.active_company_id,
      uc.active_marketplace_account_id
    FROM public.collaborators col
    JOIN public.company_users cu
      ON cu.user_id = auth.uid()
     AND cu.status = 'active'
     AND cu.is_owner = false
    JOIN public.companies c
      ON c.id = cu.company_id
     AND c.user_id = col.created_by
     AND c.is_active = true
    LEFT JOIN public.user_context uc ON uc.user_id = auth.uid()
    WHERE col.auth_user_id = auth.uid()
      AND col.status = 'active'
      AND col.deleted_at IS NULL
    ORDER BY col.accepted_at DESC NULLS LAST, col.updated_at DESC NULLS LAST
    LIMIT 1
  ), inherited_accounts AS (
    SELECT DISTINCT ON (ma.id)
      ma.id, ma.user_id, ma.ml_user_id, ma.nickname, ma.email, ma.country_id,
      ma.company_id, ma.is_active, ma.is_connected, ma.connection_status,
      ma.token_expires_at, ma.last_api_ok_at, ma.last_api_error_code,
      ma.last_api_error_at, ma.consecutive_failures, ma.created_at, ma.updated_at,
      true AS is_inherited,
      CASE
        WHEN ma.id = ac.active_marketplace_account_id THEN 1
        WHEN ma.company_id = ac.member_company_id THEN 2
        ELSE 3
      END AS priority
    FROM active_collab ac
    JOIN public.ml_accounts ma
      ON ma.user_id = ac.created_by
     AND COALESCE(ma.is_active, true) = true
     AND COALESCE(ma.is_connected, true) = true
     AND ma.connection_status IN ('connected', 'attention')
  ), own_accounts AS (
    SELECT
      ma.id, ma.user_id, ma.ml_user_id, ma.nickname, ma.email, ma.country_id,
      ma.company_id, ma.is_active, ma.is_connected, ma.connection_status,
      ma.token_expires_at, ma.last_api_ok_at, ma.last_api_error_code,
      ma.last_api_error_at, ma.consecutive_failures, ma.created_at, ma.updated_at,
      false AS is_inherited,
      99 AS priority
    FROM public.ml_accounts ma
    WHERE ma.user_id = auth.uid()
      AND NOT EXISTS (SELECT 1 FROM active_collab)
  )
  SELECT
    id, user_id, ml_user_id, nickname, email, country_id, company_id,
    is_active, is_connected, connection_status, token_expires_at,
    last_api_ok_at, last_api_error_code, last_api_error_at,
    consecutive_failures, created_at, updated_at, is_inherited
  FROM (
    SELECT * FROM inherited_accounts
    UNION ALL
    SELECT * FROM own_accounts
  ) accounts
  ORDER BY priority, is_active DESC NULLS LAST, updated_at DESC NULLS LAST, created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_accessible_ml_accounts() TO authenticated, service_role;