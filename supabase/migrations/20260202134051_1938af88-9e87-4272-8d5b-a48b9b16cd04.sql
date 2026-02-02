-- Create trial_policy table for configuring trial behavior
CREATE TABLE IF NOT EXISTS public.trial_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_days integer NOT NULL DEFAULT 14,
  requires_card boolean NOT NULL DEFAULT false,
  one_trial_per_account boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.trial_policy ENABLE ROW LEVEL SECURITY;

-- Allow public read access to trial policy
CREATE POLICY "Anyone can read trial policy" ON public.trial_policy
  FOR SELECT USING (true);

-- Insert default trial policy
INSERT INTO public.trial_policy (trial_days, requires_card, one_trial_per_account, is_active)
VALUES (14, false, true, true)
ON CONFLICT DO NOTHING;

-- Add subscription prices (mode='assinatura') for all plans that only have 'avulso'
-- First, insert assinatura prices for existing plans
INSERT INTO public.plan_prices (plan_id, mode, period, price_cents, currency, recurring, auto_renew, visible, is_campaign, sort_order)
SELECT 
  plan_id,
  'assinatura',
  'mensal',
  ROUND(price_cents * 0.95), -- 5% discount for subscription
  'BRL',
  true,
  true,
  true,
  false,
  10
FROM public.plan_prices 
WHERE mode = 'avulso' AND period = 'mensal'
ON CONFLICT DO NOTHING;

-- Update the public_plans_v1 view to include ui_order for frontend sorting
DROP VIEW IF EXISTS public.public_plans_v1;

CREATE VIEW public.public_plans_v1 AS
SELECT 
  p.id AS plan_id,
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
  -- UI order: combine mode and period for frontend display logic
  CASE 
    WHEN pp.mode = 'assinatura' THEN 0 
    ELSE 1 
  END AS mode_order,
  CASE 
    WHEN pp.period = 'mensal' THEN 1
    WHEN pp.period = 'trimestral' THEN 2
    WHEN pp.period = 'semestral' THEN 3
    WHEN pp.period = 'anual' THEN 4
    ELSE 5
  END AS period_order
FROM public.plans p
LEFT JOIN public.plan_prices pp ON pp.plan_id = p.id
WHERE p.active = true
ORDER BY p.category, p.sort_order, pp.sort_order;

-- Grant access to the view
GRANT SELECT ON public.public_plans_v1 TO anon, authenticated;
GRANT SELECT ON public.trial_policy TO anon, authenticated;