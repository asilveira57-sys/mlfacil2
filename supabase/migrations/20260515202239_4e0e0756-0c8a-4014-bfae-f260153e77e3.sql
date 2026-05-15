-- Returns ML accounts accessible to the current user, without exposing tokens.
-- Includes accounts the user owns AND accounts of companies where they are an active member.
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
  -- Own accounts
  SELECT
    ma.id, ma.user_id, ma.ml_user_id, ma.nickname, ma.email, ma.country_id,
    ma.company_id, ma.is_active, ma.is_connected, ma.connection_status,
    ma.token_expires_at, ma.last_api_ok_at, ma.last_api_error_code,
    ma.last_api_error_at, ma.consecutive_failures, ma.created_at, ma.updated_at,
    false AS is_inherited
  FROM public.ml_accounts ma
  WHERE ma.user_id = auth.uid()

  UNION

  -- Inherited from companies the user is an active member of (and is not the owner of the account)
  SELECT
    ma.id, ma.user_id, ma.ml_user_id, ma.nickname, ma.email, ma.country_id,
    ma.company_id, ma.is_active, ma.is_connected, ma.connection_status,
    ma.token_expires_at, ma.last_api_ok_at, ma.last_api_error_code,
    ma.last_api_error_at, ma.consecutive_failures, ma.created_at, ma.updated_at,
    true AS is_inherited
  FROM public.ml_accounts ma
  JOIN public.company_users cu ON cu.company_id = ma.company_id
  WHERE cu.user_id = auth.uid()
    AND cu.status = 'active'
    AND ma.user_id <> auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_accessible_ml_accounts() TO authenticated;

-- Authorization helper used by edge functions to allow token refresh from company members.
CREATE OR REPLACE FUNCTION public.can_user_use_ml_account(_user_id uuid, _account_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ml_accounts ma
    WHERE ma.id = _account_id
      AND (
        ma.user_id = _user_id
        OR EXISTS (
          SELECT 1 FROM public.company_users cu
          WHERE cu.company_id = ma.company_id
            AND cu.user_id = _user_id
            AND cu.status = 'active'
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_user_use_ml_account(uuid, uuid) TO authenticated, service_role;