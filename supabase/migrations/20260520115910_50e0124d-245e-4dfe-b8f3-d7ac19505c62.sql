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
    SELECT ma.id
    FROM active_collab ac
    JOIN LATERAL (
      SELECT ma2.id, 1 AS priority, ma2.is_active, ma2.updated_at, ma2.created_at
      FROM public.ml_accounts ma2
      WHERE ma2.company_id = ac.member_company_id
        AND ma2.user_id = ac.created_by
        AND COALESCE(ma2.is_connected, true) = true
        AND ma2.connection_status IN ('connected', 'attention')

      UNION ALL

      SELECT ma3.id, 2 AS priority, ma3.is_active, ma3.updated_at, ma3.created_at
      FROM public.user_context owner_ctx
      JOIN public.ml_accounts ma3 ON ma3.id = owner_ctx.active_marketplace_account_id
      WHERE owner_ctx.user_id = ac.created_by
        AND ma3.user_id = ac.created_by
        AND COALESCE(ma3.is_connected, true) = true
        AND ma3.connection_status IN ('connected', 'attention')

      UNION ALL

      SELECT ma4.id, 3 AS priority, ma4.is_active, ma4.updated_at, ma4.created_at
      FROM public.ml_accounts ma4
      WHERE ma4.user_id = ac.created_by
        AND COALESCE(ma4.is_connected, true) = true
        AND ma4.connection_status IN ('connected', 'attention')
    ) ma ON true
    ORDER BY ma.priority, ma.is_active DESC NULLS LAST, ma.updated_at DESC NULLS LAST, ma.created_at DESC
    LIMIT 1
  )
  SELECT
    ac.member_company_id,
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

  INSERT INTO public.user_access_state (
    user_id,
    onboarding_status,
    onboarding_completed_at,
    ml_account_connected,
    ml_account_role,
    ml_account_id,
    updated_at
  ) VALUES (
    _user_id,
    'completed'::public.onboarding_status,
    now(),
    v_ml_account_id IS NOT NULL,
    'collaborator'::public.ml_account_role,
    v_ml_account_id,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    onboarding_status = 'completed'::public.onboarding_status,
    onboarding_completed_at = COALESCE(public.user_access_state.onboarding_completed_at, now()),
    ml_account_connected = EXCLUDED.ml_account_connected,
    ml_account_role = 'collaborator'::public.ml_account_role,
    ml_account_id = EXCLUDED.ml_account_id,
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

CREATE OR REPLACE FUNCTION public.get_or_create_user_access_state(p_user_id uuid)
RETURNS public.user_access_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_state public.user_access_state;
  v_ml_account RECORD;
  v_company RECORD;
  v_onboarding_done BOOLEAN;
  v_is_collaborator BOOLEAN;
  v_collab_account_id UUID;
BEGIN
  PERFORM public.sync_collaborator_context(p_user_id);

  SELECT EXISTS (
    SELECT 1
    FROM public.company_users cu
    WHERE cu.user_id = p_user_id
      AND cu.status = 'active'
      AND cu.is_owner = false
  ) INTO v_is_collaborator;

  SELECT uc.active_marketplace_account_id INTO v_collab_account_id
  FROM public.user_context uc
  WHERE uc.user_id = p_user_id;

  SELECT * INTO v_state FROM public.user_access_state WHERE user_id = p_user_id;
  
  IF v_state IS NULL THEN
    SELECT (
      v_is_collaborator
      OR EXISTS(SELECT 1 FROM public.onboarding_user_progress WHERE user_id = p_user_id AND status = 'completed')
      OR EXISTS(SELECT 1 FROM public.ml_accounts WHERE user_id = p_user_id AND is_active = true)
    ) INTO v_onboarding_done;

    INSERT INTO public.user_access_state (
      user_id,
      onboarding_status,
      onboarding_completed_at,
      trial_status,
      payment_status,
      ml_account_connected,
      ml_account_role,
      ml_account_id
    ) VALUES (
      p_user_id,
      CASE WHEN v_onboarding_done THEN 'completed'::public.onboarding_status ELSE 'pending'::public.onboarding_status END,
      CASE WHEN v_onboarding_done THEN now() ELSE NULL END,
      'none',
      'free'::public.payment_status,
      v_is_collaborator AND v_collab_account_id IS NOT NULL,
      CASE WHEN v_is_collaborator THEN 'collaborator'::public.ml_account_role ELSE 'none'::public.ml_account_role END,
      CASE WHEN v_is_collaborator THEN v_collab_account_id ELSE NULL END
    )
    RETURNING * INTO v_state;
  ELSE
    IF v_is_collaborator THEN
      UPDATE public.user_access_state
      SET onboarding_status = 'completed'::public.onboarding_status,
          onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
          ml_account_connected = v_collab_account_id IS NOT NULL,
          ml_account_role = 'collaborator'::public.ml_account_role,
          ml_account_id = v_collab_account_id,
          updated_at = now()
      WHERE user_id = p_user_id
      RETURNING * INTO v_state;
    ELSIF v_state.onboarding_status = 'pending' THEN
      SELECT (
        EXISTS(SELECT 1 FROM public.onboarding_user_progress WHERE user_id = p_user_id AND status = 'completed')
        OR EXISTS(SELECT 1 FROM public.ml_accounts WHERE user_id = p_user_id AND is_active = true)
        OR v_state.onboarding_completed_at IS NOT NULL
      ) INTO v_onboarding_done;

      IF v_onboarding_done THEN
        UPDATE public.user_access_state
        SET onboarding_status = 'completed', updated_at = now()
        WHERE user_id = p_user_id
        RETURNING * INTO v_state;
      END IF;
    END IF;
  END IF;
  
  IF NOT v_is_collaborator THEN
    SELECT id, is_active INTO v_ml_account 
    FROM public.ml_accounts 
    WHERE user_id = p_user_id AND is_active = true
    LIMIT 1;
    
    IF v_ml_account.id IS NOT NULL THEN
      UPDATE public.user_access_state 
      SET 
        ml_account_connected = true,
        ml_account_id = v_ml_account.id,
        ml_account_role = 'owner',
        updated_at = now()
      WHERE user_id = p_user_id
      RETURNING * INTO v_state;
    END IF;
  END IF;
  
  SELECT * INTO v_company 
  FROM public.companies 
  WHERE user_id = p_user_id AND is_active = true 
  LIMIT 1;

  IF v_company IS NOT NULL AND v_company.trial_started_at IS NOT NULL THEN
    IF v_company.trial_ends_at < now() THEN
      UPDATE public.user_access_state
      SET 
        trial_status = 'expired',
        trial_start_at = v_company.trial_started_at,
        trial_end_at = v_company.trial_ends_at,
        payment_status = (CASE 
          WHEN payment_status::text IN ('active') THEN payment_status 
          ELSE 'blocked'::public.payment_status
        END),
        updated_at = now()
      WHERE user_id = p_user_id
      RETURNING * INTO v_state;
    ELSE
      UPDATE public.user_access_state
      SET 
        trial_status = 'active',
        trial_start_at = v_company.trial_started_at,
        trial_end_at = v_company.trial_ends_at,
        payment_status = (CASE
          WHEN payment_status::text = 'active' THEN 'active'::public.payment_status
          ELSE 'trial'::public.payment_status
        END),
        updated_at = now()
      WHERE user_id = p_user_id
      RETURNING * INTO v_state;
    END IF;
  END IF;
  
  RETURN v_state;
END;
$function$;

SELECT public.sync_collaborator_context('34d33604-1756-4010-b48f-a24c1e822173'::uuid);