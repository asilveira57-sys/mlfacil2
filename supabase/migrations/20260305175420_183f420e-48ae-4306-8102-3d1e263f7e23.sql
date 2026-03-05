
-- ========================================================
-- PATCH: Tier + Offer + Add-on billing schema
-- ========================================================

-- 1) Rename tenant_plans → plan_tiers, add description
ALTER TABLE public.tenant_plans RENAME TO plan_tiers;

ALTER TABLE public.plan_tiers
  ADD COLUMN IF NOT EXISTS description text;

-- 2) plan_offers — offers per tier
CREATE TABLE IF NOT EXISTS public.plan_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_id uuid NOT NULL REFERENCES public.plan_tiers(id) ON DELETE CASCADE,
  offer_code text NOT NULL,
  billing_mode text NOT NULL DEFAULT 'one_time',  -- one_time | recurring
  period_months integer NOT NULL DEFAULT 1,
  price_brl numeric NOT NULL DEFAULT 0,
  badge_text text,
  is_campaign boolean NOT NULL DEFAULT false,
  is_visible boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  mp_sync_enabled boolean NOT NULL DEFAULT false,
  mp_product_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tier_id, offer_code)
);

CREATE INDEX IF NOT EXISTS idx_plan_offers_tier ON public.plan_offers(tier_id);

ALTER TABLE public.plan_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_can_read_plan_offers" ON public.plan_offers
  FOR SELECT USING (true);

-- 3) plan_addons
CREATE TABLE IF NOT EXISTS public.plan_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plan_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_can_read_plan_addons" ON public.plan_addons
  FOR SELECT USING (true);

-- 4) plan_addon_offers
CREATE TABLE IF NOT EXISTS public.plan_addon_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  addon_id uuid NOT NULL REFERENCES public.plan_addons(id) ON DELETE CASCADE,
  offer_code text NOT NULL,
  billing_mode text NOT NULL DEFAULT 'one_time',
  period_months integer NOT NULL DEFAULT 1,
  price_brl numeric NOT NULL DEFAULT 0,
  badge_text text,
  is_campaign boolean NOT NULL DEFAULT false,
  is_visible boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  mp_sync_enabled boolean NOT NULL DEFAULT false,
  mp_product_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(addon_id, offer_code)
);

CREATE INDEX IF NOT EXISTS idx_plan_addon_offers_addon ON public.plan_addon_offers(addon_id);

ALTER TABLE public.plan_addon_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_can_read_plan_addon_offers" ON public.plan_addon_offers
  FOR SELECT USING (true);

-- 5) tenant_entitlements
CREATE TABLE IF NOT EXISTS public.tenant_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entitlement_type text NOT NULL,  -- 'tier' or 'addon'
  tier_id uuid REFERENCES public.plan_tiers(id),
  addon_id uuid REFERENCES public.plan_addons(id),
  offer_id uuid,  -- references plan_offers or plan_addon_offers depending on type
  status text NOT NULL DEFAULT 'trial',  -- trial | active | past_due | blocked | canceled
  current_period_start timestamptz,
  current_period_end timestamptz,
  auto_renew boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'mercadopago',
  last_payment_id text,
  last_external_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_entitlements_tenant ON public.tenant_entitlements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_entitlements_status ON public.tenant_entitlements(status);

ALTER TABLE public.tenant_entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_read_own_entitlements" ON public.tenant_entitlements
  FOR SELECT TO authenticated
  USING (
    tenant_id IN (SELECT id FROM public.tenants WHERE owner_user_id = auth.uid())
    OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );

-- 6) Adjust tenant_payments: rename amount → amount_brl if needed
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenant_payments' AND column_name='amount') THEN
    ALTER TABLE public.tenant_payments RENAME COLUMN amount TO amount_brl;
  END IF;
END $$;

-- 7) Seed ZPL FULL add-on
INSERT INTO public.plan_addons (code, name, description, is_active, display_order)
VALUES ('zpl_full', 'ZPL FULL', 'Impressão ZPL ilimitada e módulos avançados de etiquetas', true, 1)
ON CONFLICT (code) DO NOTHING;
