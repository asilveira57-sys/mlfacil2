CREATE OR REPLACE FUNCTION public.sync_collaborator_context(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_workspace_id uuid;
  v_ml_account_id uuid;
BEGIN
  WITH active_collab AS (
    SELECT
      col.id,
      col.workspace_id,
      col.created_by,
      cu.company_id AS member_company_id,
      col.accepted_at,
      col.updated_at
    FROM public.collaborators col
    JOIN public.company_users cu
      ON cu.user_id = _user_id
     AND cu.status = 'active'
     AND cu.is_owner = false
    JOIN public.companies c
      ON c.id = cu.company_id
     AND c.user_id = col.created_by
     AND c.is_active = true
    WHERE col.auth_user_id = _user_id
      AND col.status = 'active'
      AND col.deleted_at IS NULL
    ORDER BY col.accepted_at DESC NULLS LAST, col.updated_at DESC NULLS LAST
    LIMIT 1
  ), selected_account AS (
    SELECT ma.id, ma.company_id
    FROM active_collab ac
    JOIN LATERAL (
      SELECT ma2.id, ma2.company_id, 1 AS priority, ma2.is_active, ma2.updated_at, ma2.created_at
      FROM public.ml_accounts ma2
      WHERE ma2.company_id = ac.member_company_id
        AND COALESCE(ma2.is_connected, true) = true
        AND ma2.connection_status IN ('connected', 'attention')

      UNION ALL

      SELECT ma3.id, ma3.company_id, 2 AS priority, ma3.is_active, ma3.updated_at, ma3.created_at
      FROM public.user_context owner_ctx
      JOIN public.ml_accounts ma3 ON ma3.id = owner_ctx.active_marketplace_account_id
      WHERE owner_ctx.user_id = ac.created_by
        AND ma3.user_id = ac.created_by
        AND COALESCE(ma3.is_connected, true) = true
        AND ma3.connection_status IN ('connected', 'attention')

      UNION ALL

      SELECT ma4.id, ma4.company_id, 3 AS priority, ma4.is_active, ma4.updated_at, ma4.created_at
      FROM public.ml_accounts ma4
      WHERE ma4.user_id = ac.created_by
        AND COALESCE(ma4.is_connected, true) = true
        AND ma4.connection_status IN ('connected', 'attention')
    ) ma ON true
    ORDER BY ma.priority, ma.is_active DESC NULLS LAST, ma.updated_at DESC NULLS LAST, ma.created_at DESC
    LIMIT 1
  )
  SELECT
    COALESCE(sa.company_id, ac.member_company_id),
    ac.workspace_id,
    sa.id
  INTO v_company_id, v_workspace_id, v_ml_account_id
  FROM active_collab ac
  LEFT JOIN selected_account sa ON true;

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
$function$;

CREATE OR REPLACE FUNCTION public.get_accessible_ml_accounts()
RETURNS TABLE(id uuid, user_id uuid, ml_user_id text, nickname text, email text, country_id text, company_id uuid, is_active boolean, is_connected boolean, connection_status text, token_expires_at timestamp with time zone, last_api_ok_at timestamp with time zone, last_api_error_code text, last_api_error_at timestamp with time zone, consecutive_failures integer, created_at timestamp with time zone, updated_at timestamp with time zone, is_inherited boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
     AND COALESCE(ma.is_connected, true) = true
     AND ma.connection_status IN ('connected', 'attention')
     AND (
       ma.id = ac.active_marketplace_account_id
       OR ma.company_id = ac.member_company_id
       OR NOT EXISTS (
         SELECT 1
         FROM public.ml_accounts mx
         WHERE mx.company_id = ac.member_company_id
           AND COALESCE(mx.is_connected, true) = true
           AND mx.connection_status IN ('connected', 'attention')
       )
     )
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
$function$;

SELECT public.sync_collaborator_context('34d33604-1756-4010-b48f-a24c1e822173'::uuid);