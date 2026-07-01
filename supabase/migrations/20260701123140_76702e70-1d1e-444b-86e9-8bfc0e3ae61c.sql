
CREATE OR REPLACE FUNCTION public.admin_change_user_plan(p_target_user_id uuid, p_plan_tier_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old_tier_id uuid;
  v_old_tier_name text;
  v_new_tier_name text;
  v_new_tier_code text;
  v_company_id uuid;
  v_tenant_id uuid;
  v_period_end timestamptz;
  v_is_zpl boolean;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;

  SELECT name, code INTO v_new_tier_name, v_new_tier_code
  FROM plan_tiers WHERE id = p_plan_tier_id AND is_active = true;
  IF v_new_tier_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plano não encontrado ou inativo');
  END IF;

  v_is_zpl := (v_new_tier_code ILIKE 'zpl%');

  -- Resolve company + tenant
  SELECT c.id, c.tenant_id INTO v_company_id, v_tenant_id
  FROM companies c
  WHERE c.tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = p_target_user_id)
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    -- fallback: company owned by user
    SELECT c.id, c.tenant_id INTO v_company_id, v_tenant_id
    FROM companies c WHERE c.owner_user_id = p_target_user_id LIMIT 1;
  END IF;

  SELECT upa.plan_tier_id, pt.name INTO v_old_tier_id, v_old_tier_name
  FROM user_plan_assignments upa
  LEFT JOIN plan_tiers pt ON pt.id = upa.plan_tier_id
  WHERE upa.user_id = p_target_user_id AND upa.status = 'active'
  LIMIT 1;

  -- Deactivate current legacy assignments
  UPDATE user_plan_assignments
  SET status = 'inactive', updated_at = now()
  WHERE user_id = p_target_user_id AND status = 'active';

  -- Determine expires_at from an existing active tenant_entitlement of the same tier, if any
  SELECT current_period_end INTO v_period_end
  FROM tenant_entitlements
  WHERE tenant_id = v_tenant_id AND entitlement_type = 'tier' AND tier_id = p_plan_tier_id
  ORDER BY current_period_end DESC NULLS LAST LIMIT 1;

  INSERT INTO user_plan_assignments (user_id, tenant_id, plan_tier_id, status, is_trial, expires_at, notes)
  VALUES (
    p_target_user_id,
    v_company_id,
    p_plan_tier_id,
    'active',
    false,
    v_period_end,
    'Alterado via Admin por ' || auth.uid()::text
  );

  -- Sync tenant_entitlements (source of truth for module gating)
  IF v_tenant_id IS NOT NULL THEN
    -- Cancel other active TIER entitlements EXCEPT ZPL tiers (kept as parallel plan),
    -- and except the target tier itself.
    UPDATE tenant_entitlements te
    SET status = 'canceled', updated_at = now()
    WHERE te.tenant_id = v_tenant_id
      AND te.entitlement_type = 'tier'
      AND te.status = 'active'
      AND te.tier_id <> p_plan_tier_id
      AND te.tier_id NOT IN (SELECT id FROM plan_tiers WHERE code ILIKE 'zpl%')
      AND (v_is_zpl IS FALSE OR te.tier_id NOT IN (SELECT id FROM plan_tiers WHERE code NOT ILIKE 'zpl%'));

    -- Upsert active entitlement for the target tier
    IF EXISTS (
      SELECT 1 FROM tenant_entitlements
      WHERE tenant_id = v_tenant_id AND entitlement_type = 'tier' AND tier_id = p_plan_tier_id
    ) THEN
      UPDATE tenant_entitlements
      SET status = 'active',
          current_period_end = GREATEST(COALESCE(current_period_end, now() + interval '30 days'), now() + interval '30 days'),
          updated_at = now()
      WHERE tenant_id = v_tenant_id AND entitlement_type = 'tier' AND tier_id = p_plan_tier_id;
    ELSE
      INSERT INTO tenant_entitlements (tenant_id, entitlement_type, tier_id, status, current_period_end)
      VALUES (v_tenant_id, 'tier', p_plan_tier_id, 'active', now() + interval '30 days');
    END IF;
  END IF;

  INSERT INTO admin_action_log (admin_user_id, action_type, target_table, target_id, description, old_value, new_value)
  VALUES (
    auth.uid(),
    'change_plan',
    'user_plan_assignments',
    p_target_user_id::text,
    'Plano alterado de "' || COALESCE(v_old_tier_name, 'nenhum') || '" para "' || v_new_tier_name || '"',
    jsonb_build_object('tier_id', v_old_tier_id, 'tier_name', v_old_tier_name),
    jsonb_build_object('tier_id', p_plan_tier_id, 'tier_name', v_new_tier_name, 'tenant_id', v_tenant_id)
  );

  RETURN jsonb_build_object('success', true, 'old_plan', COALESCE(v_old_tier_name, 'nenhum'), 'new_plan', v_new_tier_name, 'tenant_id', v_tenant_id);
END;
$function$;
