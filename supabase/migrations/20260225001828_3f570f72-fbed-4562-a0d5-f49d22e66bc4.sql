
-- ============================================================
-- SECURITY FIX: Recriar views públicas com SECURITY INVOKER
-- Views sem security_invoker=on efetivamente ignoram RLS
-- ============================================================

-- 1. public_plans_v1 (tabelas: plans, plan_prices)
CREATE OR REPLACE VIEW public.public_plans_v1
WITH (security_invoker = on) AS
SELECT p.id AS plan_id,
    p.slug,
    p.name,
    p.category,
    p.description,
    p.features,
    p.active,
    p.sort_order AS plan_sort_order,
    pp.id AS price_id,
    pp.mode,
    pp.period,
    pp.price_cents,
    pp.currency,
    pp.recurring,
    pp.auto_renew,
    pp.badge_text,
    pp.visible,
    pp.is_campaign,
    pp.campaign_notes,
    pp.mp_preapproval_plan_id,
    pp.mp_checkout_url,
    pp.sort_order AS price_sort_order,
    CASE
        WHEN pp.mode = 'assinatura'::text THEN 0
        ELSE 1
    END AS mode_order,
    CASE
        WHEN pp.period = 'mensal'::text THEN 1
        WHEN pp.period = 'trimestral'::text THEN 2
        WHEN pp.period = 'semestral'::text THEN 3
        WHEN pp.period = 'anual'::text THEN 4
        ELSE 5
    END AS period_order
FROM plans p
LEFT JOIN plan_prices pp ON pp.plan_id = p.id
WHERE p.active = true
ORDER BY p.category, p.sort_order, pp.sort_order;

-- 2. unified_marketplace_accounts (tabelas: ml_accounts, ads_connections)
CREATE OR REPLACE VIEW public.unified_marketplace_accounts
WITH (security_invoker = on) AS
SELECT ma.id,
    ma.user_id,
    ma.ml_user_id AS seller_id,
    ma.nickname,
    ma.email,
    'mercadolivre'::text AS provider,
    CASE
        WHEN ma.is_active = false THEN 'disconnected'::text
        WHEN ma.token_expires_at < now() THEN 'expired'::text
        ELSE 'connected'::text
    END AS status,
    ma.is_active,
    ma.created_at,
    ma.updated_at,
    ac.id AS ads_connection_id,
    ac.last_sync_at AS ads_last_sync,
    ac.auto_sync_enabled AS ads_auto_sync
FROM ml_accounts ma
LEFT JOIN ads_connections ac ON ac.user_id = ma.user_id AND ac.seller_id = ma.ml_user_id;

-- 3. priority_notifications (tabela: app_notifications)
CREATE OR REPLACE VIEW public.priority_notifications
WITH (security_invoker = on) AS
SELECT id,
    user_id,
    workspace_id,
    seller_id,
    category,
    priority,
    title,
    body,
    reference_type,
    reference_id,
    action_url,
    group_key,
    is_read,
    is_dismissed,
    is_actioned,
    created_at,
    read_at,
    expires_at,
    metadata,
    is_snoozed,
    snooze_until,
    snoozed_at,
    resolved_at,
    resolved_by,
    origin_module,
    (
        CASE
            WHEN priority = 'urgent'::notification_priority THEN 100
            WHEN priority = 'high'::notification_priority THEN 75
            WHEN priority = 'normal'::notification_priority THEN 50
            WHEN priority = 'low'::notification_priority THEN 25
            ELSE 50
        END +
        CASE
            WHEN category = ANY (ARRAY['qa_sla_breached'::notification_category, 'qa_blocked'::notification_category, 'post_sale_blocked'::notification_category]) THEN 50
            WHEN category = ANY (ARRAY['qa_sla_warning'::notification_category, 'qa_send_error'::notification_category, 'post_sale_error'::notification_category]) THEN 30
            ELSE 0
        END)::numeric + LEAST(EXTRACT(epoch FROM now() - created_at) / 3600::numeric, 48::numeric) AS priority_score
FROM app_notifications n
WHERE is_dismissed = false AND (is_snoozed = false OR snooze_until < now()) AND is_actioned = false
ORDER BY ((
        CASE
            WHEN priority = 'urgent'::notification_priority THEN 100
            WHEN priority = 'high'::notification_priority THEN 75
            WHEN priority = 'normal'::notification_priority THEN 50
            WHEN priority = 'low'::notification_priority THEN 25
            ELSE 50
        END +
        CASE
            WHEN category = ANY (ARRAY['qa_sla_breached'::notification_category, 'qa_blocked'::notification_category, 'post_sale_blocked'::notification_category]) THEN 50
            WHEN category = ANY (ARRAY['qa_sla_warning'::notification_category, 'qa_send_error'::notification_category, 'post_sale_error'::notification_category]) THEN 30
            ELSE 0
        END)::numeric + LEAST(EXTRACT(epoch FROM now() - created_at) / 3600::numeric, 48::numeric)) DESC, created_at DESC;

-- 4. mktpfacil_clone_history (tabelas: mktpfacil_clone_jobs, mktpfacil_clone_job_units, ml_accounts)
CREATE OR REPLACE VIEW public.mktpfacil_clone_history
WITH (security_invoker = on) AS
SELECT j.id AS job_id,
    j.user_id,
    j.source_item_id,
    j.source_url,
    j.destination_account_id,
    a.nickname AS destination_nickname,
    a.ml_user_id AS destination_seller_id,
    j.status,
    j.created_at,
    j.started_at,
    j.finished_at,
    j.source_snapshot_json ->> 'title'::text AS source_title,
    j.source_snapshot_json ->> 'thumbnail'::text AS source_thumbnail,
    j.settings_json,
    j.summary_json,
    ( SELECT count(*) AS count
           FROM mktpfacil_clone_job_units u
          WHERE u.job_id = j.id) AS total_units,
    ( SELECT count(*) AS count
           FROM mktpfacil_clone_job_units u
          WHERE u.job_id = j.id AND u.status = 'created'::text) AS created_units,
    ( SELECT count(*) AS count
           FROM mktpfacil_clone_job_units u
          WHERE u.job_id = j.id AND u.status = 'failed'::text) AS failed_units
FROM mktpfacil_clone_jobs j
LEFT JOIN ml_accounts a ON a.id = j.destination_account_id;

-- ============================================================
-- Permissões: revogar acesso público, conceder apenas a authenticated
-- ============================================================
REVOKE ALL ON public.public_plans_v1 FROM public;
GRANT SELECT ON public.public_plans_v1 TO authenticated;
GRANT SELECT ON public.public_plans_v1 TO anon; -- planos são públicos por natureza

REVOKE ALL ON public.unified_marketplace_accounts FROM public;
GRANT SELECT ON public.unified_marketplace_accounts TO authenticated;

REVOKE ALL ON public.priority_notifications FROM public;
GRANT SELECT ON public.priority_notifications TO authenticated;

REVOKE ALL ON public.mktpfacil_clone_history FROM public;
GRANT SELECT ON public.mktpfacil_clone_history TO authenticated;

-- ============================================================
-- Comentários estruturais
-- ============================================================
COMMENT ON VIEW public.public_plans_v1 IS 'SECURITY INVOKER ONLY – RLS ENFORCED – MKTP FACIL STANDARD';
COMMENT ON VIEW public.unified_marketplace_accounts IS 'SECURITY INVOKER ONLY – RLS ENFORCED – MKTP FACIL STANDARD';
COMMENT ON VIEW public.priority_notifications IS 'SECURITY INVOKER ONLY – RLS ENFORCED – MKTP FACIL STANDARD';
COMMENT ON VIEW public.mktpfacil_clone_history IS 'SECURITY INVOKER ONLY – RLS ENFORCED – MKTP FACIL STANDARD';
COMMENT ON VIEW public.meli_orders_ready_view IS 'SECURITY INVOKER ONLY – RLS ENFORCED – MKTP FACIL STANDARD';

-- ============================================================
-- Log de auditoria
-- ============================================================
INSERT INTO public.system_logs (level, system_area, action, success, message, meta_json)
VALUES (
  'info',
  'database_security',
  'remove_security_definer',
  true,
  'Views recriadas como SECURITY INVOKER para respeitar RLS: public_plans_v1, unified_marketplace_accounts, priority_notifications, mktpfacil_clone_history',
  '{"views_fixed": ["public_plans_v1", "unified_marketplace_accounts", "priority_notifications", "mktpfacil_clone_history"], "views_already_ok": ["meli_orders_ready_view"], "total_fixed": 4}'::jsonb
);
