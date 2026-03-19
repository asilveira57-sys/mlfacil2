
CREATE OR REPLACE FUNCTION public.admin_get_clients_overview()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text,
  whatsapp text,
  cpf text,
  photo_url text,
  profile_created_at timestamptz,
  onboarding_status text,
  trial_status text,
  trial_start_at timestamptz,
  trial_end_at timestamptz,
  selected_plan_id uuid,
  payment_status text,
  ml_account_connected boolean,
  company_id uuid,
  company_name text,
  company_document text,
  company_city text,
  company_state text,
  ml_accounts jsonb,
  roles text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    au.id AS user_id,
    p.full_name,
    COALESCE(p.email, au.email) AS email,
    p.whatsapp,
    p.cpf,
    p.photo_url,
    COALESCE(p.created_at, au.created_at) AS profile_created_at,
    uas.onboarding_status::text,
    uas.trial_status::text,
    uas.trial_start_at,
    uas.trial_end_at,
    uas.selected_plan_id,
    uas.payment_status::text,
    uas.ml_account_connected,
    c.id AS company_id,
    c.display_name AS company_name,
    c.document_number AS company_document,
    c.city AS company_city,
    c.state AS company_state,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'id', ma.id,
        'nickname', ma.nickname,
        'ml_user_id', ma.ml_user_id,
        'connection_status', ma.connection_status,
        'is_active', ma.is_active
      ))
      FROM ml_accounts ma WHERE ma.user_id = au.id),
      '[]'::jsonb
    ) AS ml_accounts,
    COALESCE(
      ARRAY(SELECT ur.role::text FROM user_roles ur WHERE ur.user_id = au.id),
      '{}'::text[]
    ) AS roles
  FROM auth.users au
  LEFT JOIN profiles p ON p.user_id = au.id
  LEFT JOIN user_access_state uas ON uas.user_id = au.id
  LEFT JOIN LATERAL (
    SELECT co.id, co.display_name, co.document_number, co.city, co.state
    FROM companies co
    WHERE co.user_id = au.id AND co.is_active = true
    ORDER BY co.is_primary DESC NULLS LAST, co.created_at ASC
    LIMIT 1
  ) c ON true
  WHERE has_role(auth.uid(), 'admin')
  ORDER BY au.created_at DESC;
$$;
