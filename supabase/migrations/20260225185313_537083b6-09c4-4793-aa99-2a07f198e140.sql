
DROP VIEW IF EXISTS public.public_plans_v1;

CREATE VIEW public.public_plans_v1 AS
SELECT p.id AS plan_id,
    p.slug,
    p.name,
    p.category,
    p.description,
    p.features,
    p.active,
    p.sort_order AS plan_sort_order,
    p.max_sales,
    p.min_sales,
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

-- Re-grant access
GRANT SELECT ON public.public_plans_v1 TO anon, authenticated;
