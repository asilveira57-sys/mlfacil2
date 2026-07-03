CREATE OR REPLACE FUNCTION public.rpc_activate_entitlement(
  p_tenant_id uuid,
  p_entitlement_type text,
  p_tier_code text DEFAULT NULL::text,
  p_addon_code text DEFAULT NULL::text,
  p_offer_code text DEFAULT NULL::text,
  p_payment_id text DEFAULT NULL::text,
  p_external_reference text DEFAULT NULL::text,
  p_auto_renew boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tier_id uuid;
  v_tier_code text;
  v_tier_plan_group text;
  v_is_zpl boolean := false;
  v_addon_id uuid;
  v_offer_id uuid;
  v_period_months int;
  v_period_end timestamptz;
  v_entitlement_id uuid;
  v_existing_same_payment uuid;
  v_existing_full record;
BEGIN
  IF p_payment_id IS NOT NULL THEN
    SELECT id INTO v_existing_same_payment
    FROM public.tenant_entitlements
    WHERE tenant_id = p_tenant_id
      AND entitlement_type = p_entitlement_type
      AND last_payment_id = p_payment_id
    ORDER BY created_at DESC
    LIMIT 1;
    IF v_existing_same_payment IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'entitlement_id', v_existing_same_payment, 'skipped', true, 'reason', 'duplicate_payment_id');
    END IF;
  END IF;

  IF p_entitlement_type = 'tier' THEN
    SELECT id, code, plan_group INTO v_tier_id, v_tier_code, v_tier_plan_group
    FROM public.plan_tiers
    WHERE code = p_tier_code AND is_active = true
    LIMIT 1;
    IF v_tier_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Tier not found: ' || p_tier_code);
    END IF;

    v_is_zpl := (COALESCE(v_tier_plan_group, '') = 'zpl' OR v_tier_code ILIKE 'zpl%');

    SELECT id, period_months INTO v_offer_id, v_period_months
    FROM public.plan_offers
    WHERE tier_id = v_tier_id AND offer_code = p_offer_code AND is_active = true
    LIMIT 1;
    IF v_offer_id IS NULL THEN v_period_months := 1; END IF;

    IF v_is_zpl THEN
      SELECT e.id, e.tier_id, e.current_period_end INTO v_existing_full
      FROM public.tenant_entitlements e
      JOIN public.plan_tiers pt ON pt.id = e.tier_id
      WHERE e.tenant_id = p_tenant_id
        AND e.entitlement_type = 'tier'
        AND e.status IN ('active', 'trial', 'past_due')
        AND COALESCE(pt.plan_group, '') <> 'zpl'
        AND pt.code NOT ILIKE 'zpl%'
      ORDER BY e.current_period_end DESC NULLS LAST, e.created_at DESC
      LIMIT 1;

      IF v_existing_full.id IS NOT NULL THEN
        UPDATE public.tenant_entitlements e
        SET status = 'canceled', updated_at = now()
        FROM public.plan_tiers pt
        WHERE e.tier_id = pt.id
          AND e.tenant_id = p_tenant_id
          AND e.entitlement_type = 'tier'
          AND e.status IN ('active', 'trial', 'past_due')
          AND (COALESCE(pt.plan_group, '') = 'zpl' OR pt.code ILIKE 'zpl%');

        UPDATE public.user_access_state
        SET payment_status = 'active', trial_status = 'expired', updated_at = now()
        WHERE user_id IN (SELECT user_id FROM public.tenant_members WHERE tenant_id = p_tenant_id)
           OR user_id IN (SELECT cu.user_id FROM public.company_users cu JOIN public.companies c ON c.id = cu.company_id WHERE c.tenant_id = p_tenant_id AND cu.status = 'active')
           OR user_id IN (SELECT c.user_id FROM public.companies c WHERE c.tenant_id = p_tenant_id AND c.user_id IS NOT NULL)
           OR user_id = p_tenant_id;

        INSERT INTO public.audit_logs (tenant_id, action, entity_type, entity_id, metadata)
        VALUES (p_tenant_id, 'zpl_ignored_higher_plan_active', 'tenant_entitlements', v_existing_full.id,
          jsonb_build_object('tier_code', p_tier_code, 'payment_id', p_payment_id, 'external_reference', p_external_reference));

        RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'higher_plan_active', 'entitlement_id', v_existing_full.id, 'active_tier_id', v_existing_full.tier_id, 'period_end', v_existing_full.current_period_end);
      END IF;
    END IF;

    UPDATE public.tenant_entitlements e
    SET status = 'canceled', updated_at = now()
    WHERE e.tenant_id = p_tenant_id
      AND e.entitlement_type = 'tier'
      AND e.status IN ('active', 'trial', 'past_due')
      AND e.tier_id <> v_tier_id;

  ELSIF p_entitlement_type = 'addon' THEN
    SELECT id INTO v_addon_id FROM public.plan_addons WHERE code = p_addon_code AND is_active = true LIMIT 1;
    IF v_addon_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Addon not found: ' || p_addon_code); END IF;
    SELECT id, period_months INTO v_offer_id, v_period_months FROM public.plan_addon_offers WHERE addon_id = v_addon_id AND offer_code = p_offer_code AND is_active = true LIMIT 1;
    IF v_offer_id IS NULL THEN v_period_months := 1; END IF;
    UPDATE public.tenant_entitlements SET status = 'canceled', updated_at = now()
    WHERE tenant_id = p_tenant_id AND entitlement_type = 'addon' AND addon_id = v_addon_id AND status IN ('active', 'trial', 'past_due');
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid entitlement_type');
  END IF;

  v_period_end := now() + (v_period_months || ' months')::interval;

  INSERT INTO public.tenant_entitlements (tenant_id, entitlement_type, tier_id, addon_id, offer_id, status, current_period_start, current_period_end, auto_renew, source, last_payment_id, last_external_reference)
  VALUES (p_tenant_id, p_entitlement_type, v_tier_id, v_addon_id, v_offer_id, 'active', now(), v_period_end, p_auto_renew, 'mercadopago', p_payment_id, p_external_reference)
  RETURNING id INTO v_entitlement_id;

  UPDATE public.user_access_state
  SET payment_status = 'active', trial_status = 'expired', updated_at = now()
  WHERE user_id IN (SELECT user_id FROM public.tenant_members WHERE tenant_id = p_tenant_id)
     OR user_id IN (SELECT cu.user_id FROM public.company_users cu JOIN public.companies c ON c.id = cu.company_id WHERE c.tenant_id = p_tenant_id AND cu.status = 'active')
     OR user_id IN (SELECT c.user_id FROM public.companies c WHERE c.tenant_id = p_tenant_id AND c.user_id IS NOT NULL)
     OR user_id = p_tenant_id;

  INSERT INTO public.audit_logs (tenant_id, action, entity_type, entity_id, metadata)
  VALUES (p_tenant_id, 'entitlement_activated', 'tenant_entitlements', v_entitlement_id,
    jsonb_build_object('type', p_entitlement_type, 'tier_code', p_tier_code, 'addon_code', p_addon_code, 'offer_code', p_offer_code, 'period_months', v_period_months, 'period_end', v_period_end, 'payment_id', p_payment_id, 'auto_renew', p_auto_renew));

  RETURN jsonb_build_object('success', true, 'entitlement_id', v_entitlement_id, 'period_end', v_period_end, 'period_months', v_period_months);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_activate_entitlement(p_tenant_id text, p_entitlement_type text, p_tier_code text DEFAULT NULL::text, p_addon_code text DEFAULT NULL::text, p_offer_code text DEFAULT NULL::text, p_payment_id text DEFAULT NULL::text, p_external_reference text DEFAULT NULL::text, p_auto_renew boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.rpc_activate_entitlement(p_tenant_id::uuid, p_entitlement_type, p_tier_code, p_addon_code, p_offer_code, p_payment_id, p_external_reference, p_auto_renew);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_renew_entitlement(p_tenant_id uuid, p_entitlement_type text, p_payment_id text DEFAULT NULL::text, p_external_reference text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ent record; v_period_months int; v_new_end timestamptz; v_parts text[]; v_entity_code text; v_tier_code text; v_addon_code text; v_is_zpl boolean := false; v_existing_full record;
BEGIN
  IF p_external_reference IS NOT NULL AND position(':' in p_external_reference) > 0 THEN
    v_parts := string_to_array(p_external_reference, ':');
    IF array_length(v_parts, 1) >= 1 THEN
      v_entity_code := v_parts[1];
      IF v_entity_code LIKE 'addon\_%' ESCAPE '\' THEN v_addon_code := substr(v_entity_code, 7); ELSE v_tier_code := v_entity_code; END IF;
    END IF;
  END IF;
  v_is_zpl := (v_tier_code ILIKE 'zpl%' OR EXISTS (SELECT 1 FROM public.plan_tiers pt WHERE pt.code = v_tier_code AND COALESCE(pt.plan_group, '') = 'zpl'));

  SELECT e.*, COALESCE(o.period_months, ao.period_months, 1) as resolved_period, pt.code as resolved_tier_code, pt.plan_group as resolved_plan_group
  INTO v_ent
  FROM public.tenant_entitlements e
  LEFT JOIN public.plan_offers o ON o.id = e.offer_id
  LEFT JOIN public.plan_addon_offers ao ON ao.id = e.offer_id
  LEFT JOIN public.plan_tiers pt ON pt.id = e.tier_id
  LEFT JOIN public.plan_addons pa ON pa.id = e.addon_id
  WHERE e.tenant_id = p_tenant_id
    AND e.entitlement_type = p_entitlement_type
    AND e.status IN ('active', 'past_due')
    AND ((p_entitlement_type = 'tier' AND (v_tier_code IS NULL OR pt.code = v_tier_code)) OR (p_entitlement_type = 'addon' AND (v_addon_code IS NULL OR pa.code = v_addon_code)) OR (p_entitlement_type NOT IN ('tier','addon')))
  ORDER BY e.current_period_end DESC NULLS LAST, e.created_at DESC
  LIMIT 1;

  IF v_ent IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'No active entitlement found'); END IF;
  IF p_payment_id IS NOT NULL AND v_ent.last_payment_id = p_payment_id THEN RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'duplicate_payment_id', 'current_period_end', v_ent.current_period_end); END IF;

  IF p_entitlement_type = 'tier' THEN v_is_zpl := v_is_zpl OR COALESCE(v_ent.resolved_plan_group, '') = 'zpl' OR v_ent.resolved_tier_code ILIKE 'zpl%'; END IF;

  IF p_entitlement_type = 'tier' AND v_is_zpl THEN
    SELECT e.id, e.tier_id, e.current_period_end INTO v_existing_full
    FROM public.tenant_entitlements e
    JOIN public.plan_tiers pt ON pt.id = e.tier_id
    WHERE e.tenant_id = p_tenant_id AND e.entitlement_type = 'tier' AND e.status IN ('active', 'past_due') AND e.id <> v_ent.id AND COALESCE(pt.plan_group, '') <> 'zpl' AND pt.code NOT ILIKE 'zpl%'
    ORDER BY e.current_period_end DESC NULLS LAST, e.created_at DESC LIMIT 1;

    IF v_existing_full.id IS NOT NULL THEN
      UPDATE public.tenant_entitlements SET status = 'canceled', last_payment_id = COALESCE(p_payment_id, last_payment_id), last_external_reference = COALESCE(p_external_reference, last_external_reference), updated_at = now() WHERE id = v_ent.id;
      UPDATE public.user_access_state SET payment_status = 'active', trial_status = 'expired', updated_at = now()
      WHERE user_id IN (SELECT user_id FROM public.tenant_members WHERE tenant_id = p_tenant_id)
         OR user_id IN (SELECT cu.user_id FROM public.company_users cu JOIN public.companies c ON c.id = cu.company_id WHERE c.tenant_id = p_tenant_id AND cu.status = 'active')
         OR user_id IN (SELECT c.user_id FROM public.companies c WHERE c.tenant_id = p_tenant_id AND c.user_id IS NOT NULL)
         OR user_id = p_tenant_id;
      INSERT INTO public.audit_logs (tenant_id, action, entity_type, entity_id, metadata)
      VALUES (p_tenant_id, 'zpl_renewal_ignored_higher_plan_active', 'tenant_entitlements', v_existing_full.id, jsonb_build_object('ignored_entitlement_id', v_ent.id, 'payment_id', p_payment_id, 'external_reference', p_external_reference));
      RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'higher_plan_active', 'entitlement_id', v_existing_full.id, 'current_period_end', v_existing_full.current_period_end);
    END IF;
  END IF;

  v_period_months := v_ent.resolved_period;
  v_new_end := GREATEST(COALESCE(v_ent.current_period_end, now()), now()) + (v_period_months || ' months')::interval;
  UPDATE public.tenant_entitlements SET status = 'active', current_period_end = v_new_end, last_payment_id = COALESCE(p_payment_id, last_payment_id), last_external_reference = COALESCE(p_external_reference, last_external_reference), updated_at = now() WHERE id = v_ent.id;

  IF p_entitlement_type = 'tier' AND NOT v_is_zpl THEN
    UPDATE public.tenant_entitlements e SET status = 'canceled', updated_at = now()
    FROM public.plan_tiers pt
    WHERE e.tier_id = pt.id AND e.tenant_id = p_tenant_id AND e.entitlement_type = 'tier' AND e.id <> v_ent.id AND e.status IN ('active', 'trial', 'past_due') AND (COALESCE(pt.plan_group, '') = 'zpl' OR pt.code ILIKE 'zpl%');
    UPDATE public.user_access_state SET payment_status = 'active', trial_status = 'expired', updated_at = now()
    WHERE user_id IN (SELECT user_id FROM public.tenant_members WHERE tenant_id = p_tenant_id)
       OR user_id IN (SELECT cu.user_id FROM public.company_users cu JOIN public.companies c ON c.id = cu.company_id WHERE c.tenant_id = p_tenant_id AND cu.status = 'active')
       OR user_id IN (SELECT c.user_id FROM public.companies c WHERE c.tenant_id = p_tenant_id AND c.user_id IS NOT NULL)
       OR user_id = p_tenant_id;
  END IF;

  INSERT INTO public.audit_logs (tenant_id, action, entity_type, entity_id, metadata)
  VALUES (p_tenant_id, 'entitlement_renewed', 'tenant_entitlements', v_ent.id, jsonb_build_object('period_months', v_period_months, 'new_end', v_new_end, 'payment_id', p_payment_id));
  RETURN jsonb_build_object('success', true, 'new_period_end', v_new_end);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_change_user_plan(p_target_user_id uuid, p_plan_tier_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old_tier_id uuid; v_old_tier_name text; v_new_tier_name text; v_tenant_id uuid; v_assignment_company_id uuid; v_period_end timestamptz; v_target_ent_id uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN RETURN jsonb_build_object('success', false, 'error', 'Acesso negado'); END IF;
  SELECT name INTO v_new_tier_name FROM public.plan_tiers WHERE id = p_plan_tier_id AND is_active = true;
  IF v_new_tier_name IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Plano não encontrado ou inativo'); END IF;

  SELECT tm.tenant_id INTO v_tenant_id FROM public.tenant_members tm WHERE tm.user_id = p_target_user_id ORDER BY tm.created_at ASC LIMIT 1;
  IF v_tenant_id IS NULL THEN SELECT c.tenant_id INTO v_tenant_id FROM public.companies c WHERE c.user_id = p_target_user_id AND c.tenant_id IS NOT NULL ORDER BY c.is_primary DESC NULLS LAST, c.created_at ASC LIMIT 1; END IF;
  IF v_tenant_id IS NULL THEN SELECT c.tenant_id INTO v_tenant_id FROM public.company_users cu JOIN public.companies c ON c.id = cu.company_id WHERE cu.user_id = p_target_user_id AND cu.status = 'active' AND c.tenant_id IS NOT NULL ORDER BY cu.is_owner DESC NULLS LAST, cu.created_at ASC LIMIT 1; END IF;
  IF v_tenant_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Tenant não encontrado para este usuário'); END IF;

  SELECT c.id INTO v_assignment_company_id FROM public.companies c WHERE c.tenant_id = v_tenant_id ORDER BY c.is_primary DESC NULLS LAST, c.created_at ASC LIMIT 1;

  SELECT upa.plan_tier_id, pt.name INTO v_old_tier_id, v_old_tier_name
  FROM public.user_plan_assignments upa LEFT JOIN public.plan_tiers pt ON pt.id = upa.plan_tier_id
  WHERE upa.user_id = p_target_user_id AND upa.status = 'active'
  ORDER BY CASE WHEN COALESCE(pt.plan_group,'') = 'zpl' OR pt.code ILIKE 'zpl%' THEN 1 ELSE 0 END, upa.created_at DESC LIMIT 1;

  SELECT GREATEST(
    COALESCE((SELECT MAX(te.current_period_end) FROM public.tenant_entitlements te WHERE te.tenant_id = v_tenant_id AND te.status IN ('active', 'past_due', 'trial') AND te.current_period_end IS NOT NULL), '-infinity'::timestamptz),
    COALESCE((SELECT MAX(upa.expires_at) FROM public.user_plan_assignments upa WHERE upa.user_id = p_target_user_id AND upa.status = 'active' AND upa.expires_at IS NOT NULL), '-infinity'::timestamptz)
  ) INTO v_period_end;
  IF v_period_end = '-infinity'::timestamptz OR v_period_end IS NULL OR v_period_end < now() THEN v_period_end := now() + interval '30 days'; END IF;

  UPDATE public.user_plan_assignments SET status = 'inactive', updated_at = now() WHERE user_id = p_target_user_id AND status = 'active';
  INSERT INTO public.user_plan_assignments (user_id, tenant_id, plan_tier_id, status, starts_at, expires_at, is_trial, notes, created_by, updated_by)
  VALUES (p_target_user_id, v_assignment_company_id, p_plan_tier_id, 'active', now(), v_period_end, false, 'Alterado via Admin por ' || auth.uid()::text, auth.uid(), auth.uid());

  UPDATE public.tenant_entitlements SET status = 'canceled', updated_at = now() WHERE tenant_id = v_tenant_id AND entitlement_type = 'tier' AND status IN ('active', 'trial', 'past_due') AND tier_id <> p_plan_tier_id;
  SELECT id INTO v_target_ent_id FROM public.tenant_entitlements WHERE tenant_id = v_tenant_id AND entitlement_type = 'tier' AND tier_id = p_plan_tier_id ORDER BY current_period_end DESC NULLS LAST, created_at DESC LIMIT 1;
  IF v_target_ent_id IS NOT NULL THEN
    UPDATE public.tenant_entitlements SET status = 'canceled', updated_at = now() WHERE tenant_id = v_tenant_id AND entitlement_type = 'tier' AND tier_id = p_plan_tier_id AND id <> v_target_ent_id;
    UPDATE public.tenant_entitlements SET status = 'active', current_period_start = COALESCE(current_period_start, now()), current_period_end = v_period_end, source = COALESCE(source, 'admin'), updated_at = now() WHERE id = v_target_ent_id;
  ELSE
    INSERT INTO public.tenant_entitlements (tenant_id, entitlement_type, tier_id, status, current_period_start, current_period_end, source) VALUES (v_tenant_id, 'tier', p_plan_tier_id, 'active', now(), v_period_end, 'admin') RETURNING id INTO v_target_ent_id;
  END IF;

  UPDATE public.user_access_state SET payment_status = 'active', trial_status = 'expired', updated_at = now() WHERE user_id = p_target_user_id;
  INSERT INTO public.admin_action_log (admin_user_id, action_type, target_table, target_id, description, old_value, new_value)
  VALUES (auth.uid(), 'change_plan', 'user_plan_assignments', p_target_user_id::text, 'Plano alterado de "' || COALESCE(v_old_tier_name, 'nenhum') || '" para "' || v_new_tier_name || '"', jsonb_build_object('tier_id', v_old_tier_id, 'tier_name', v_old_tier_name), jsonb_build_object('tier_id', p_plan_tier_id, 'tier_name', v_new_tier_name, 'tenant_id', v_tenant_id, 'period_end', v_period_end));
  RETURN jsonb_build_object('success', true, 'old_plan', COALESCE(v_old_tier_name, 'nenhum'), 'new_plan', v_new_tier_name, 'tenant_id', v_tenant_id, 'entitlement_id', v_target_ent_id, 'period_end', v_period_end);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_get_clients_overview()
RETURNS TABLE(user_id uuid, full_name text, email text, whatsapp text, cpf text, photo_url text, profile_created_at timestamp with time zone, onboarding_status text, trial_status text, trial_start_at timestamp with time zone, trial_end_at timestamp with time zone, selected_plan_id uuid, payment_status text, ml_account_connected boolean, company_id uuid, company_name text, company_document text, company_city text, company_state text, ml_accounts jsonb, roles text[], last_sign_in_at timestamp with time zone, last_activity_at timestamp with time zone, tag text, plan_name text, entitlement_id uuid, entitlement_status text, entitlement_period_start timestamp with time zone, entitlement_period_end timestamp with time zone, entitlement_auto_renew boolean, entitlement_tier_name text, entitlement_source text, workspace_id uuid, collaborators jsonb)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH principal_companies AS (
    SELECT DISTINCT ON (c.id) c.id AS company_id, COALESCE(owner_cu.user_id, c.user_id) AS owner_user_id, c.display_name, c.document_number, c.city, c.state, c.created_at, c.is_primary
    FROM public.companies c
    LEFT JOIN public.company_users owner_cu ON owner_cu.company_id = c.id AND owner_cu.is_owner = true AND owner_cu.status = 'active'
    WHERE c.is_active = true AND COALESCE(owner_cu.user_id, c.user_id) IS NOT NULL
      AND NOT (NOT EXISTS (SELECT 1 FROM public.ml_accounts ma WHERE ma.company_id = c.id) AND EXISTS (SELECT 1 FROM public.collaborators col WHERE col.auth_user_id = COALESCE(owner_cu.user_id, c.user_id) AND col.status = 'active' AND col.deleted_at IS NULL))
    ORDER BY c.id, owner_cu.created_at ASC NULLS LAST
  ), orphan_users AS (
    SELECT au.id AS owner_user_id, NULL::uuid AS company_id, NULL::text AS display_name, NULL::text AS document_number, NULL::text AS city, NULL::text AS state, au.created_at, false AS is_primary
    FROM auth.users au
    WHERE NOT EXISTS (SELECT 1 FROM public.company_users cu WHERE cu.user_id = au.id AND cu.is_owner = true AND cu.status = 'active')
      AND NOT EXISTS (SELECT 1 FROM public.company_users cu WHERE cu.user_id = au.id AND cu.is_owner = false AND cu.status = 'active')
      AND NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.user_id = au.id AND c.is_active = true)
      AND NOT EXISTS (SELECT 1 FROM public.collaborators col WHERE col.auth_user_id = au.id AND col.status = 'active' AND col.deleted_at IS NULL)
  ), base AS (SELECT * FROM principal_companies UNION ALL SELECT * FROM orphan_users)
  SELECT au.id AS user_id, p.full_name, COALESCE(p.email, au.email) AS email, p.whatsapp, p.cpf, p.photo_url, COALESCE(p.created_at, au.created_at) AS profile_created_at,
    uas.onboarding_status::text, uas.trial_status::text, uas.trial_start_at, uas.trial_end_at, uas.selected_plan_id, uas.payment_status::text, uas.ml_account_connected,
    b.company_id, b.display_name AS company_name, b.document_number AS company_document, b.city AS company_city, b.state AS company_state,
    COALESCE(ml.ml_accounts, '[]'::jsonb) AS ml_accounts, COALESCE(ARRAY(SELECT ur.role::text FROM public.user_roles ur WHERE ur.user_id = au.id), '{}'::text[]) AS roles,
    au.last_sign_in_at,
    GREATEST(COALESCE((SELECT MAX(umu2.last_seen_at) FROM public.user_module_usage umu2 WHERE umu2.user_id = au.id), '-infinity'::timestamp with time zone), COALESCE(collab_activity.last_activity_at, '-infinity'::timestamp with time zone)) AS last_activity_at,
    p.tag,
    COALESCE(ent.tier_name, (SELECT pt.name FROM public.user_plan_assignments upa JOIN public.plan_tiers pt ON pt.id = upa.plan_tier_id WHERE upa.user_id = au.id AND upa.status = 'active' ORDER BY CASE WHEN COALESCE(pt.plan_group,'') = 'zpl' OR pt.code ILIKE 'zpl%' THEN 1 ELSE 0 END, upa.created_at DESC LIMIT 1)) AS plan_name,
    ent.id AS entitlement_id, ent.status AS entitlement_status, COALESCE(ent.current_period_start, upa_period.starts_at) AS entitlement_period_start, COALESCE(ent.current_period_end, upa_period.expires_at) AS entitlement_period_end,
    ent.auto_renew AS entitlement_auto_renew, ent.tier_name AS entitlement_tier_name, ent.source AS entitlement_source, owner_ws.workspace_id, COALESCE(collabs.collaborators, '[]'::jsonb) AS collaborators
  FROM base b
  JOIN auth.users au ON au.id = b.owner_user_id
  LEFT JOIN public.profiles p ON p.user_id = au.id
  LEFT JOIN public.user_access_state uas ON uas.user_id = au.id
  LEFT JOIN LATERAL (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = au.id AND wm.role = 'admin' ORDER BY wm.created_at ASC LIMIT 1) owner_ws ON true
  LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('id', ma.id, 'nickname', ma.nickname, 'ml_user_id', ma.ml_user_id, 'connection_status', ma.connection_status, 'is_active', ma.is_active, 'created_at', ma.created_at, 'last_activity_at', (SELECT MAX(umu.last_seen_at) FROM public.user_module_usage umu WHERE umu.seller_id = ma.id)) ORDER BY ma.is_active DESC NULLS LAST, ma.created_at DESC) AS ml_accounts FROM public.ml_accounts ma WHERE (b.company_id IS NOT NULL AND ma.company_id = b.company_id) OR (b.company_id IS NULL AND ma.user_id = au.id)) ml ON true
  LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('id', col.id, 'auth_user_id', col.auth_user_id, 'name', col.name, 'email', col.email, 'status', col.status, 'profile_id', col.profile_id, 'profile_name', ap.name, 'workspace_id', col.workspace_id, 'invited_at', col.invited_at, 'accepted_at', col.accepted_at, 'disabled_at', col.disabled_at, 'deleted_at', col.deleted_at, 'last_sign_in_at', cau.last_sign_in_at, 'last_activity_at', (SELECT MAX(umu3.last_seen_at) FROM public.user_module_usage umu3 WHERE umu3.user_id = col.auth_user_id), 'inherited_ml_account_id', primary_ml.id, 'inherited_ml_nickname', primary_ml.nickname, 'inherited_ml_user_id', primary_ml.ml_user_id) ORDER BY col.created_at DESC) AS collaborators FROM public.collaborators col LEFT JOIN auth.users cau ON cau.id = col.auth_user_id LEFT JOIN public.access_profiles ap ON ap.id = col.profile_id LEFT JOIN LATERAL (SELECT ma.id, ma.nickname, ma.ml_user_id FROM public.ml_accounts ma WHERE ma.company_id = b.company_id ORDER BY ma.is_active DESC NULLS LAST, ma.created_at DESC LIMIT 1) primary_ml ON true WHERE b.company_id IS NOT NULL AND col.created_by = au.id AND col.deleted_at IS NULL) collabs ON true
  LEFT JOIN LATERAL (SELECT MAX(umu4.last_seen_at) AS last_activity_at FROM public.collaborators col2 JOIN public.user_module_usage umu4 ON umu4.user_id = col2.auth_user_id WHERE b.company_id IS NOT NULL AND col2.created_by = au.id AND col2.deleted_at IS NULL) collab_activity ON true
  LEFT JOIN LATERAL (
    SELECT te.id, te.status, te.current_period_start, te.current_period_end, te.auto_renew, te.source, COALESCE(pt2.name, pa.name) AS tier_name, te.created_at, te.entitlement_type, pt2.code AS tier_code, pt2.plan_group AS plan_group
    FROM public.tenant_entitlements te
    LEFT JOIN public.tenant_members tmm ON tmm.tenant_id = te.tenant_id
    LEFT JOIN public.tenants tnt ON tnt.id = te.tenant_id
    LEFT JOIN public.companies cmp ON cmp.tenant_id = te.tenant_id
    LEFT JOIN public.plan_tiers pt2 ON pt2.id = te.tier_id
    LEFT JOIN public.plan_addons pa ON pa.id = te.addon_id
    WHERE (tmm.user_id = au.id OR tnt.owner_user_id = au.id OR cmp.user_id = au.id)
      AND te.entitlement_type IN ('tier', 'plan', 'subscription', 'addon')
    ORDER BY CASE WHEN te.status = 'active' THEN 0 ELSE 1 END, CASE WHEN te.entitlement_type = 'tier' AND COALESCE(pt2.plan_group, '') <> 'zpl' AND pt2.code NOT ILIKE 'zpl%' THEN 0 ELSE 1 END, CASE WHEN te.entitlement_type IN ('tier','plan','subscription') THEN 0 ELSE 1 END, te.current_period_end DESC NULLS LAST, te.created_at DESC
    LIMIT 1
  ) ent ON true
  LEFT JOIN LATERAL (SELECT upa.starts_at, upa.expires_at FROM public.user_plan_assignments upa LEFT JOIN public.plan_tiers pt ON pt.id = upa.plan_tier_id WHERE upa.user_id = au.id AND upa.status = 'active' ORDER BY CASE WHEN COALESCE(pt.plan_group,'') = 'zpl' OR pt.code ILIKE 'zpl%' THEN 1 ELSE 0 END, upa.created_at DESC LIMIT 1) upa_period ON true
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY COALESCE(b.created_at, au.created_at) DESC;
$function$;

-- Immediate correction for RODRIGOPOSSO VET / Rodrigo.
WITH target AS (SELECT 'e7bc87df-57df-47b1-b7d8-4530b130ab18'::uuid AS user_id, '78e5ef89-572e-4c51-a4a8-2f6b9598b137'::uuid AS tenant_id, '987d3c38-7590-4b7d-ad4d-aaf19c5a2720'::uuid AS company_id, 'f1e2d3c4-b5a6-7890-abcd-ef1234567890'::uuid AS veterano_id),
best_period AS (SELECT GREATEST(COALESCE((SELECT MAX(te.current_period_end) FROM public.tenant_entitlements te, target t WHERE te.tenant_id = t.tenant_id AND te.current_period_end IS NOT NULL), '-infinity'::timestamptz), COALESCE((SELECT MAX(upa.expires_at) FROM public.user_plan_assignments upa, target t WHERE upa.user_id = t.user_id AND upa.expires_at IS NOT NULL), '-infinity'::timestamptz), '2026-08-30 12:10:01.411383+00'::timestamptz) AS period_end),
keep_veterano AS (SELECT te.id FROM public.tenant_entitlements te, target t WHERE te.tenant_id = t.tenant_id AND te.entitlement_type = 'tier' AND te.tier_id = t.veterano_id ORDER BY te.current_period_end DESC NULLS LAST, te.created_at DESC LIMIT 1)
UPDATE public.tenant_entitlements te
SET status = CASE WHEN te.id = (SELECT id FROM keep_veterano) THEN 'active' ELSE 'canceled' END, current_period_end = CASE WHEN te.id = (SELECT id FROM keep_veterano) THEN (SELECT period_end FROM best_period) ELSE te.current_period_end END, updated_at = now()
FROM target t
WHERE te.tenant_id = t.tenant_id AND te.entitlement_type = 'tier';

WITH target AS (SELECT 'e7bc87df-57df-47b1-b7d8-4530b130ab18'::uuid AS user_id, '987d3c38-7590-4b7d-ad4d-aaf19c5a2720'::uuid AS company_id, 'f1e2d3c4-b5a6-7890-abcd-ef1234567890'::uuid AS veterano_id),
best_period AS (SELECT GREATEST(COALESCE((SELECT MAX(te.current_period_end) FROM public.tenant_entitlements te WHERE te.tenant_id = '78e5ef89-572e-4c51-a4a8-2f6b9598b137'::uuid AND te.current_period_end IS NOT NULL), '-infinity'::timestamptz), COALESCE((SELECT MAX(upa.expires_at) FROM public.user_plan_assignments upa, target t WHERE upa.user_id = t.user_id AND upa.expires_at IS NOT NULL), '-infinity'::timestamptz), '2026-08-30 12:10:01.411383+00'::timestamptz) AS period_end),
active_assignment AS (SELECT upa.id FROM public.user_plan_assignments upa, target t WHERE upa.user_id = t.user_id AND upa.plan_tier_id = t.veterano_id ORDER BY upa.created_at DESC LIMIT 1)
UPDATE public.user_plan_assignments upa
SET status = CASE WHEN upa.id = (SELECT id FROM active_assignment) THEN 'active' ELSE 'inactive' END, tenant_id = t.company_id, plan_tier_id = t.veterano_id, expires_at = CASE WHEN upa.id = (SELECT id FROM active_assignment) THEN (SELECT period_end FROM best_period) ELSE upa.expires_at END, updated_at = now()
FROM target t
WHERE upa.user_id = t.user_id;

UPDATE public.user_access_state SET payment_status = 'active', trial_status = 'expired', updated_at = now()
WHERE user_id = 'e7bc87df-57df-47b1-b7d8-4530b130ab18'::uuid;
