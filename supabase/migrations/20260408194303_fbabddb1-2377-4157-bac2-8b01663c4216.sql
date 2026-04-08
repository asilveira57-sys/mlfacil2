
-- 1. RPC: admin_change_user_plan
CREATE OR REPLACE FUNCTION public.admin_change_user_plan(
  p_target_user_id uuid,
  p_plan_tier_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old_tier_id uuid;
  v_old_tier_name text;
  v_new_tier_name text;
BEGIN
  -- Check admin
  IF NOT has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;

  -- Validate tier exists
  SELECT name INTO v_new_tier_name FROM plan_tiers WHERE id = p_plan_tier_id AND is_active = true;
  IF v_new_tier_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plano não encontrado ou inativo');
  END IF;

  -- Get current active tier
  SELECT upa.plan_tier_id, pt.name INTO v_old_tier_id, v_old_tier_name
  FROM user_plan_assignments upa
  LEFT JOIN plan_tiers pt ON pt.id = upa.plan_tier_id
  WHERE upa.user_id = p_target_user_id AND upa.status = 'active'
  LIMIT 1;

  -- Deactivate all current assignments
  UPDATE user_plan_assignments
  SET status = 'inactive', updated_at = now()
  WHERE user_id = p_target_user_id AND status = 'active';

  -- Insert new assignment
  INSERT INTO user_plan_assignments (user_id, plan_tier_id, status, is_trial, notes)
  SELECT
    p_target_user_id,
    p_plan_tier_id,
    'active',
    false,
    'Alterado via Admin por ' || auth.uid()::text;

  -- Log
  INSERT INTO admin_action_log (admin_user_id, action_type, target_table, target_id, description, old_value, new_value)
  VALUES (
    auth.uid(),
    'change_plan',
    'user_plan_assignments',
    p_target_user_id::text,
    'Plano alterado de "' || COALESCE(v_old_tier_name, 'nenhum') || '" para "' || v_new_tier_name || '"',
    jsonb_build_object('tier_id', v_old_tier_id, 'tier_name', v_old_tier_name),
    jsonb_build_object('tier_id', p_plan_tier_id, 'tier_name', v_new_tier_name)
  );

  RETURN jsonb_build_object('success', true, 'old_plan', COALESCE(v_old_tier_name, 'nenhum'), 'new_plan', v_new_tier_name);
END;
$$;

-- 2. Update admin_get_clients_overview to include plan_name
DROP FUNCTION IF EXISTS public.admin_get_clients_overview();

CREATE OR REPLACE FUNCTION public.admin_get_clients_overview()
RETURNS TABLE(
  user_id uuid, full_name text, email text, whatsapp text, cpf text, photo_url text,
  profile_created_at timestamptz, onboarding_status text, trial_status text,
  trial_start_at timestamptz, trial_end_at timestamptz, selected_plan_id uuid,
  payment_status text, ml_account_connected boolean,
  company_id uuid, company_name text, company_document text, company_city text, company_state text,
  ml_accounts jsonb, roles text[], last_sign_in_at timestamptz, last_activity_at timestamptz, tag text,
  plan_name text
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
    (SELECT pt.name FROM user_plan_assignments upa JOIN plan_tiers pt ON pt.id = upa.plan_tier_id WHERE upa.user_id = au.id AND upa.status = 'active' ORDER BY upa.created_at DESC LIMIT 1) AS plan_name
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
  WHERE has_role(auth.uid(), 'admin')
  ORDER BY au.created_at DESC;
$function$;
