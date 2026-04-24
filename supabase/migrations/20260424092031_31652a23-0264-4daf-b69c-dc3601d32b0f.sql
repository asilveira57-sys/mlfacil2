DROP FUNCTION IF EXISTS public.admin_get_clients_overview();

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
   entitlement_source text
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    COALESCE(cu_co.id, legacy_co.id) AS company_id,
    COALESCE(cu_co.display_name, legacy_co.display_name) AS company_name,
    COALESCE(cu_co.document_number, legacy_co.document_number) AS company_document,
    COALESCE(cu_co.city, legacy_co.city) AS company_city,
    COALESCE(cu_co.state, legacy_co.state) AS company_state,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'id', ma.id,
        'nickname', ma.nickname,
        'ml_user_id', ma.ml_user_id,
        'connection_status', ma.connection_status,
        'is_active', ma.is_active,
        'created_at', ma.created_at,
        'last_activity_at', (SELECT MAX(umu.last_seen_at) FROM user_module_usage umu WHERE umu.seller_id = ma.id)
      ))
      FROM ml_accounts ma WHERE ma.user_id = au.id),
      '[]'::jsonb
    ) AS ml_accounts,
    COALESCE(
      ARRAY(SELECT ur.role::text FROM user_roles ur WHERE ur.user_id = au.id),
      '{}'::text[]
    ) AS roles,
    au.last_sign_in_at,
    (SELECT MAX(umu2.last_seen_at) FROM user_module_usage umu2 WHERE umu2.user_id = au.id) AS last_activity_at,
    p.tag,
    (SELECT pt.name FROM user_plan_assignments upa JOIN plan_tiers pt ON pt.id = upa.plan_tier_id WHERE upa.user_id = au.id AND upa.status = 'active' ORDER BY upa.created_at DESC LIMIT 1) AS plan_name,
    ent.id AS entitlement_id,
    ent.status AS entitlement_status,
    ent.current_period_start AS entitlement_period_start,
    ent.current_period_end AS entitlement_period_end,
    ent.auto_renew AS entitlement_auto_renew,
    ent.tier_name AS entitlement_tier_name,
    ent.source AS entitlement_source
  FROM auth.users au
  LEFT JOIN profiles p ON p.user_id = au.id
  LEFT JOIN user_access_state uas ON uas.user_id = au.id
  LEFT JOIN LATERAL (
    SELECT co.id, co.display_name, co.document_number, co.city, co.state
    FROM company_users cuu
    JOIN companies co ON co.id = cuu.company_id AND co.is_active = true
    WHERE cuu.user_id = au.id
    ORDER BY co.is_primary DESC NULLS LAST, co.created_at ASC
    LIMIT 1
  ) cu_co ON true
  LEFT JOIN LATERAL (
    SELECT co.id, co.display_name, co.document_number, co.city, co.state
    FROM companies co
    WHERE co.user_id = au.id AND co.is_active = true AND cu_co.id IS NULL
    ORDER BY co.is_primary DESC NULLS LAST, co.created_at ASC
    LIMIT 1
  ) legacy_co ON true
  LEFT JOIN LATERAL (
    SELECT te.id, te.status, te.current_period_start, te.current_period_end,
           te.auto_renew, te.source, pt2.name AS tier_name, te.created_at
    FROM tenant_entitlements te
    JOIN tenant_members tmm ON tmm.tenant_id = te.tenant_id
    LEFT JOIN plan_tiers pt2 ON pt2.id = te.tier_id
    WHERE tmm.user_id = au.id
      AND te.entitlement_type IN ('tier', 'plan', 'subscription')
    ORDER BY 
      CASE WHEN te.status = 'active' THEN 0 ELSE 1 END,
      te.current_period_end DESC NULLS LAST,
      te.created_at DESC
    LIMIT 1
  ) ent ON true
  WHERE has_role(auth.uid(), 'admin')
  ORDER BY au.created_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_entitlement_period(
  p_entitlement_id uuid,
  p_new_period_end timestamptz,
  p_auto_renew boolean DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_old record;
  v_new_status text;
BEGIN
  IF NOT has_role(v_admin_id, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;

  SELECT * INTO v_old FROM tenant_entitlements WHERE id = p_entitlement_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Entitlement não encontrado');
  END IF;

  v_new_status := COALESCE(p_status, v_old.status);

  UPDATE tenant_entitlements
     SET current_period_end = p_new_period_end,
         auto_renew = COALESCE(p_auto_renew, auto_renew),
         status = v_new_status,
         updated_at = now()
   WHERE id = p_entitlement_id;

  INSERT INTO admin_action_log (
    admin_user_id, action_type, target_table, target_id,
    description, old_value, new_value
  ) VALUES (
    v_admin_id,
    'entitlement_period_update',
    'tenant_entitlements',
    p_entitlement_id,
    COALESCE(p_reason, 'Ajuste manual via Admin Clientes'),
    jsonb_build_object(
      'current_period_end', v_old.current_period_end,
      'auto_renew', v_old.auto_renew,
      'status', v_old.status
    ),
    jsonb_build_object(
      'current_period_end', p_new_period_end,
      'auto_renew', COALESCE(p_auto_renew, v_old.auto_renew),
      'status', v_new_status
    )
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_entitlement_period(uuid, timestamptz, boolean, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_entitlement_period(uuid, timestamptz, boolean, text, text) TO authenticated;