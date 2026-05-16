DROP FUNCTION IF EXISTS public.admin_get_clients_overview();

CREATE OR REPLACE FUNCTION public.sync_collaborator_context(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_workspace_id uuid;
  v_ml_account_id uuid;
BEGIN
  SELECT c.id, col.workspace_id, ma.id
    INTO v_company_id, v_workspace_id, v_ml_account_id
  FROM public.collaborators col
  JOIN public.companies c
    ON c.user_id = col.created_by
   AND c.is_active = true
  JOIN public.company_users cu
    ON cu.company_id = c.id
   AND cu.user_id = _user_id
   AND cu.status = 'active'
   AND cu.is_owner = false
  LEFT JOIN LATERAL (
    SELECT ma2.id
    FROM public.ml_accounts ma2
    WHERE ma2.company_id = c.id
      AND COALESCE(ma2.is_connected, true) = true
      AND ma2.connection_status IN ('connected', 'attention')
    ORDER BY ma2.is_active DESC NULLS LAST, ma2.updated_at DESC NULLS LAST, ma2.created_at DESC
    LIMIT 1
  ) ma ON true
  WHERE col.auth_user_id = _user_id
    AND col.status = 'active'
    AND col.deleted_at IS NULL
  ORDER BY col.accepted_at DESC NULLS LAST, col.updated_at DESC NULLS LAST
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.user_context (user_id, active_company_id, active_marketplace_account_id, updated_at)
  VALUES (_user_id, v_company_id, v_ml_account_id, now())
  ON CONFLICT (user_id) DO UPDATE SET
    active_company_id = EXCLUDED.active_company_id,
    active_marketplace_account_id = EXCLUDED.active_marketplace_account_id,
    updated_at = now();

  IF v_workspace_id IS NOT NULL THEN
    INSERT INTO public.user_preferences (user_id, active_workspace_id, updated_at)
    VALUES (_user_id, v_workspace_id, now())
    ON CONFLICT (user_id) DO UPDATE SET
      active_workspace_id = EXCLUDED.active_workspace_id,
      updated_at = now();
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_accessible_ml_accounts()
RETURNS TABLE(
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
  token_expires_at timestamp with time zone,
  last_api_ok_at timestamp with time zone,
  last_api_error_code text,
  last_api_error_at timestamp with time zone,
  consecutive_failures integer,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  is_inherited boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH active_ctx AS (
    SELECT uc.active_company_id
    FROM public.user_context uc
    WHERE uc.user_id = auth.uid()
  ), active_collab_companies AS (
    SELECT DISTINCT cu.company_id
    FROM public.company_users cu
    JOIN public.collaborators col
      ON col.auth_user_id = cu.user_id
     AND col.status = 'active'
     AND col.deleted_at IS NULL
    JOIN public.companies owner_company
      ON owner_company.id = cu.company_id
     AND owner_company.user_id = col.created_by
    WHERE cu.user_id = auth.uid()
      AND cu.status = 'active'
      AND cu.is_owner = false
  )
  SELECT
    ma.id, ma.user_id, ma.ml_user_id, ma.nickname, ma.email, ma.country_id,
    ma.company_id, ma.is_active, ma.is_connected, ma.connection_status,
    ma.token_expires_at, ma.last_api_ok_at, ma.last_api_error_code,
    ma.last_api_error_at, ma.consecutive_failures, ma.created_at, ma.updated_at,
    false AS is_inherited
  FROM public.ml_accounts ma
  WHERE ma.user_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1
      FROM active_collab_companies acc
      WHERE acc.company_id = (SELECT active_company_id FROM active_ctx)
        AND ma.company_id IS DISTINCT FROM acc.company_id
    )

  UNION

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
    AND cu.is_owner = false
    AND ma.user_id <> auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.collaborators col
      JOIN public.companies owner_company
        ON owner_company.id = ma.company_id
       AND owner_company.user_id = col.created_by
      WHERE col.auth_user_id = auth.uid()
        AND col.workspace_id IS NOT NULL
        AND col.status = 'active'
        AND col.deleted_at IS NULL
    );
$$;

CREATE OR REPLACE FUNCTION public.admin_get_clients_overview()
RETURNS TABLE(
  user_id uuid,
  full_name text,
  email text,
  whatsapp text,
  cpf text,
  photo_url text,
  profile_created_at timestamp with time zone,
  onboarding_status text,
  trial_status text,
  trial_start_at timestamp with time zone,
  trial_end_at timestamp with time zone,
  selected_plan_id uuid,
  payment_status text,
  ml_account_connected boolean,
  company_id uuid,
  company_name text,
  company_document text,
  company_city text,
  company_state text,
  ml_accounts jsonb,
  roles text[],
  last_sign_in_at timestamp with time zone,
  last_activity_at timestamp with time zone,
  tag text,
  plan_name text,
  entitlement_id uuid,
  entitlement_status text,
  entitlement_period_start timestamp with time zone,
  entitlement_period_end timestamp with time zone,
  entitlement_auto_renew boolean,
  entitlement_tier_name text,
  entitlement_source text,
  collaborators jsonb
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH principal_companies AS (
    SELECT DISTINCT ON (c.id)
      c.id AS company_id,
      COALESCE(owner_cu.user_id, c.user_id) AS owner_user_id,
      c.display_name,
      c.document_number,
      c.city,
      c.state,
      c.created_at,
      c.is_primary
    FROM public.companies c
    LEFT JOIN public.company_users owner_cu
      ON owner_cu.company_id = c.id
     AND owner_cu.is_owner = true
     AND owner_cu.status = 'active'
    WHERE c.is_active = true
      AND COALESCE(owner_cu.user_id, c.user_id) IS NOT NULL
    ORDER BY c.id, owner_cu.created_at ASC NULLS LAST
  ), orphan_users AS (
    SELECT
      au.id AS owner_user_id,
      NULL::uuid AS company_id,
      NULL::text AS display_name,
      NULL::text AS document_number,
      NULL::text AS city,
      NULL::text AS state,
      au.created_at,
      false AS is_primary
    FROM auth.users au
    WHERE NOT EXISTS (
      SELECT 1 FROM public.company_users cu
      WHERE cu.user_id = au.id
        AND cu.is_owner = true
        AND cu.status = 'active'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.company_users cu
      WHERE cu.user_id = au.id
        AND cu.is_owner = false
        AND cu.status = 'active'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.user_id = au.id
        AND c.is_active = true
    )
  ), base AS (
    SELECT * FROM principal_companies
    UNION ALL
    SELECT * FROM orphan_users
  )
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
    b.company_id,
    b.display_name AS company_name,
    b.document_number AS company_document,
    b.city AS company_city,
    b.state AS company_state,
    COALESCE(ml.ml_accounts, '[]'::jsonb) AS ml_accounts,
    COALESCE(ARRAY(SELECT ur.role::text FROM public.user_roles ur WHERE ur.user_id = au.id), '{}'::text[]) AS roles,
    au.last_sign_in_at,
    GREATEST(
      COALESCE((SELECT MAX(umu2.last_seen_at) FROM public.user_module_usage umu2 WHERE umu2.user_id = au.id), '-infinity'::timestamp with time zone),
      COALESCE(collab_activity.last_activity_at, '-infinity'::timestamp with time zone)
    ) AS last_activity_at,
    p.tag,
    (SELECT pt.name FROM public.user_plan_assignments upa JOIN public.plan_tiers pt ON pt.id = upa.plan_tier_id WHERE upa.user_id = au.id AND upa.status = 'active' ORDER BY upa.created_at DESC LIMIT 1) AS plan_name,
    ent.id AS entitlement_id,
    ent.status AS entitlement_status,
    ent.current_period_start AS entitlement_period_start,
    ent.current_period_end AS entitlement_period_end,
    ent.auto_renew AS entitlement_auto_renew,
    ent.tier_name AS entitlement_tier_name,
    ent.source AS entitlement_source,
    COALESCE(collabs.collaborators, '[]'::jsonb) AS collaborators
  FROM base b
  JOIN auth.users au ON au.id = b.owner_user_id
  LEFT JOIN public.profiles p ON p.user_id = au.id
  LEFT JOIN public.user_access_state uas ON uas.user_id = au.id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'id', ma.id,
      'nickname', ma.nickname,
      'ml_user_id', ma.ml_user_id,
      'connection_status', ma.connection_status,
      'is_active', ma.is_active,
      'created_at', ma.created_at,
      'last_activity_at', (SELECT MAX(umu.last_seen_at) FROM public.user_module_usage umu WHERE umu.seller_id = ma.id)
    ) ORDER BY ma.is_active DESC NULLS LAST, ma.created_at DESC) AS ml_accounts
    FROM public.ml_accounts ma
    WHERE (b.company_id IS NOT NULL AND ma.company_id = b.company_id)
       OR (b.company_id IS NULL AND ma.user_id = au.id)
  ) ml ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'id', col.id,
      'auth_user_id', col.auth_user_id,
      'name', col.name,
      'email', col.email,
      'status', col.status,
      'profile_id', col.profile_id,
      'profile_name', ap.name,
      'workspace_id', col.workspace_id,
      'invited_at', col.invited_at,
      'accepted_at', col.accepted_at,
      'disabled_at', col.disabled_at,
      'deleted_at', col.deleted_at,
      'last_sign_in_at', cau.last_sign_in_at,
      'last_activity_at', (SELECT MAX(umu3.last_seen_at) FROM public.user_module_usage umu3 WHERE umu3.user_id = col.auth_user_id),
      'inherited_ml_account_id', primary_ml.id,
      'inherited_ml_nickname', primary_ml.nickname,
      'inherited_ml_user_id', primary_ml.ml_user_id
    ) ORDER BY col.created_at DESC) AS collaborators
    FROM public.collaborators col
    LEFT JOIN auth.users cau ON cau.id = col.auth_user_id
    LEFT JOIN public.access_profiles ap ON ap.id = col.profile_id
    LEFT JOIN LATERAL (
      SELECT ma.id, ma.nickname, ma.ml_user_id
      FROM public.ml_accounts ma
      WHERE ma.company_id = b.company_id
      ORDER BY ma.is_active DESC NULLS LAST, ma.created_at DESC
      LIMIT 1
    ) primary_ml ON true
    WHERE b.company_id IS NOT NULL
      AND col.created_by = au.id
      AND col.deleted_at IS NULL
  ) collabs ON true
  LEFT JOIN LATERAL (
    SELECT MAX(umu4.last_seen_at) AS last_activity_at
    FROM public.collaborators col2
    JOIN public.user_module_usage umu4 ON umu4.user_id = col2.auth_user_id
    WHERE b.company_id IS NOT NULL
      AND col2.created_by = au.id
      AND col2.deleted_at IS NULL
  ) collab_activity ON true
  LEFT JOIN LATERAL (
    SELECT te.id, te.status, te.current_period_start, te.current_period_end,
           te.auto_renew, te.source, pt2.name AS tier_name, te.created_at
    FROM public.tenant_entitlements te
    JOIN public.tenant_members tmm ON tmm.tenant_id = te.tenant_id
    LEFT JOIN public.plan_tiers pt2 ON pt2.id = te.tier_id
    WHERE tmm.user_id = au.id
      AND te.entitlement_type IN ('tier', 'plan', 'subscription')
    ORDER BY
      CASE WHEN te.status = 'active' THEN 0 ELSE 1 END,
      te.current_period_end DESC NULLS LAST,
      te.created_at DESC
    LIMIT 1
  ) ent ON true
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY COALESCE(b.created_at, au.created_at) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.sync_collaborator_context(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_accessible_ml_accounts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_clients_overview() TO authenticated;