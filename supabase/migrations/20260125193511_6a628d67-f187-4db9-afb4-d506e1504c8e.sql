-- =============================================
-- BILLING SYSTEM TABLES
-- =============================================

-- 1. billing_plans - Main plans table
CREATE TABLE public.billing_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  features JSONB DEFAULT '[]'::jsonb,
  category TEXT NOT NULL DEFAULT 'volume',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. billing_plan_prices - Prices for each plan
CREATE TABLE public.billing_plan_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.billing_plans(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('one_time', 'subscription')),
  period TEXT NOT NULL CHECK (period IN ('monthly', 'quarterly', 'semiannual', 'annual_campaign')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'BRL',
  badge_text TEXT,
  label_sub TEXT,
  ui_order INTEGER NOT NULL DEFAULT 0,
  is_visible BOOLEAN DEFAULT true,
  published_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. billing_provider_map - Payment provider integration
CREATE TABLE public.billing_provider_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_price_id UUID NOT NULL REFERENCES public.billing_plan_prices(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'mercado_pago',
  provider_mode TEXT NOT NULL CHECK (provider_mode IN ('preference', 'preapproval_plan')),
  provider_id TEXT,
  status TEXT NOT NULL DEFAULT 'not_synced' CHECK (status IN ('not_synced', 'active', 'inactive', 'error')),
  last_sync_at TIMESTAMPTZ,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. billing_settings - Key/value configuration
CREATE TABLE public.billing_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. checkout_logs - Checkout attempt logs
CREATE TABLE public.checkout_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  plan_price_id UUID REFERENCES public.billing_plan_prices(id),
  provider TEXT NOT NULL DEFAULT 'mercado_pago',
  provider_mode TEXT,
  provider_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  request_payload JSONB,
  response_payload JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- TRIGGERS FOR updated_at
-- =============================================

CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER set_billing_plans_updated_at
  BEFORE UPDATE ON public.billing_plans
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_billing_plan_prices_updated_at
  BEFORE UPDATE ON public.billing_plan_prices
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_billing_provider_map_updated_at
  BEFORE UPDATE ON public.billing_provider_map
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_billing_settings_updated_at
  BEFORE UPDATE ON public.billing_settings
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- =============================================
-- RLS POLICIES
-- =============================================

ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_plan_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_provider_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_logs ENABLE ROW LEVEL SECURITY;

-- Public read for active plans with published prices
CREATE POLICY "Public can read active plans with published prices"
  ON public.billing_plans FOR SELECT
  USING (
    is_active = true 
    AND EXISTS (
      SELECT 1 FROM public.billing_plan_prices 
      WHERE plan_id = billing_plans.id 
        AND published_at IS NOT NULL 
        AND is_visible = true
    )
  );

-- Public read for published and visible prices
CREATE POLICY "Public can read published visible prices"
  ON public.billing_plan_prices FOR SELECT
  USING (published_at IS NOT NULL AND is_visible = true);

-- Public read for billing settings (needed for UI config)
CREATE POLICY "Public can read billing settings"
  ON public.billing_settings FOR SELECT
  USING (true);

-- Service role can do everything (for edge functions)
CREATE POLICY "Service role full access to billing_plans"
  ON public.billing_plans FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to billing_plan_prices"
  ON public.billing_plan_prices FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to billing_provider_map"
  ON public.billing_provider_map FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to billing_settings"
  ON public.billing_settings FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to checkout_logs"
  ON public.checkout_logs FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Users can read their own checkout logs
CREATE POLICY "Users can read own checkout logs"
  ON public.checkout_logs FOR SELECT
  USING (auth.uid() = user_id);

-- =============================================
-- PUBLIC VIEW for easy querying
-- =============================================

CREATE OR REPLACE VIEW public.public_plans_v1 AS
SELECT 
  bp.id as plan_id,
  bp.slug,
  bp.name,
  bp.description,
  bp.features,
  bp.category,
  bpp.id as price_id,
  bpp.mode,
  bpp.period,
  bpp.amount_cents,
  bpp.currency,
  bpp.badge_text,
  bpp.label_sub,
  bpp.ui_order
FROM public.billing_plans bp
JOIN public.billing_plan_prices bpp ON bpp.plan_id = bp.id
WHERE bp.is_active = true
  AND bpp.published_at IS NOT NULL
  AND bpp.is_visible = true
ORDER BY bp.category, bpp.ui_order;

-- =============================================
-- INDEXES
-- =============================================

CREATE INDEX idx_billing_plan_prices_plan_id ON public.billing_plan_prices(plan_id);
CREATE INDEX idx_billing_plan_prices_published ON public.billing_plan_prices(published_at) WHERE published_at IS NOT NULL;
CREATE INDEX idx_billing_provider_map_price_id ON public.billing_provider_map(plan_price_id);
CREATE INDEX idx_checkout_logs_user_id ON public.checkout_logs(user_id);
CREATE INDEX idx_checkout_logs_created_at ON public.checkout_logs(created_at DESC);

-- =============================================
-- SEED: Initial settings
-- =============================================

INSERT INTO public.billing_settings (key, value) VALUES
  ('campaigns', '{"annual_enabled": false}'::jsonb),
  ('ui_copy', '{
    "one_time_note": "Pagamento único • Sem renovação automática",
    "subscription_note": "Cobrança mensal recorrente • Renovação automática • Cancele quando quiser"
  }'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- =============================================
-- SEED: Volume Plans
-- =============================================

-- Plan: Até 50 vendas/mês
INSERT INTO public.billing_plans (slug, name, description, features, category) VALUES
  ('volume_ate_50', 'Até 50 vendas/mês', 'Ideal para quem está começando', 
   '["Dashboard completo", "Análise ABC", "Relatórios básicos"]'::jsonb, 'volume');

INSERT INTO public.billing_plan_prices (plan_id, mode, period, amount_cents, label_sub, ui_order, published_at)
SELECT id, 'one_time', 'monthly', 2490, 'Pagamento único • Sem renovação automática', 1, now()
FROM public.billing_plans WHERE slug = 'volume_ate_50';

INSERT INTO public.billing_plan_prices (plan_id, mode, period, amount_cents, label_sub, ui_order, published_at)
SELECT id, 'one_time', 'quarterly', 6990, 'Pagamento único • Sem renovação automática', 2, now()
FROM public.billing_plans WHERE slug = 'volume_ate_50';

INSERT INTO public.billing_plan_prices (plan_id, mode, period, amount_cents, label_sub, ui_order, published_at)
SELECT id, 'one_time', 'semiannual', 12990, 'Pagamento único • Sem renovação automática', 3, now()
FROM public.billing_plans WHERE slug = 'volume_ate_50';

-- Plan: 51 a 300 vendas/mês
INSERT INTO public.billing_plans (slug, name, description, features, category) VALUES
  ('volume_51_300', '51 a 300 vendas/mês', 'Para vendedores em crescimento',
   '["Dashboard completo", "Análise ABC avançada", "Relatórios detalhados", "Suporte prioritário"]'::jsonb, 'volume');

INSERT INTO public.billing_plan_prices (plan_id, mode, period, amount_cents, label_sub, ui_order, published_at)
SELECT id, 'one_time', 'monthly', 3490, 'Pagamento único • Sem renovação automática', 1, now()
FROM public.billing_plans WHERE slug = 'volume_51_300';

INSERT INTO public.billing_plan_prices (plan_id, mode, period, amount_cents, label_sub, ui_order, published_at)
SELECT id, 'one_time', 'quarterly', 9990, 'Pagamento único • Sem renovação automática', 2, now()
FROM public.billing_plans WHERE slug = 'volume_51_300';

INSERT INTO public.billing_plan_prices (plan_id, mode, period, amount_cents, label_sub, ui_order, published_at)
SELECT id, 'one_time', 'semiannual', 18990, 'Pagamento único • Sem renovação automática', 3, now()
FROM public.billing_plans WHERE slug = 'volume_51_300';

-- Plan: 301 a 700 vendas/mês
INSERT INTO public.billing_plans (slug, name, description, features, category) VALUES
  ('volume_301_700', '301 a 700 vendas/mês', 'Para operações consolidadas',
   '["Dashboard completo", "Análise ABC avançada", "Relatórios detalhados", "Suporte prioritário", "API de integração"]'::jsonb, 'volume');

INSERT INTO public.billing_plan_prices (plan_id, mode, period, amount_cents, label_sub, ui_order, published_at)
SELECT id, 'one_time', 'monthly', 4990, 'Pagamento único • Sem renovação automática', 1, now()
FROM public.billing_plans WHERE slug = 'volume_301_700';

INSERT INTO public.billing_plan_prices (plan_id, mode, period, amount_cents, label_sub, ui_order, published_at)
SELECT id, 'one_time', 'quarterly', 13990, 'Pagamento único • Sem renovação automática', 2, now()
FROM public.billing_plans WHERE slug = 'volume_301_700';

INSERT INTO public.billing_plan_prices (plan_id, mode, period, amount_cents, label_sub, ui_order, published_at)
SELECT id, 'one_time', 'semiannual', 26990, 'Pagamento único • Sem renovação automática', 3, now()
FROM public.billing_plans WHERE slug = 'volume_301_700';

-- Plan: 701 a 1500 vendas/mês
INSERT INTO public.billing_plans (slug, name, description, features, category) VALUES
  ('volume_701_1500', '701 a 1500 vendas/mês', 'Para grandes vendedores',
   '["Dashboard completo", "Análise ABC avançada", "Relatórios detalhados", "Suporte prioritário", "API de integração", "Gerente de conta"]'::jsonb, 'volume');

INSERT INTO public.billing_plan_prices (plan_id, mode, period, amount_cents, label_sub, ui_order, published_at)
SELECT id, 'one_time', 'monthly', 7990, 'Pagamento único • Sem renovação automática', 1, now()
FROM public.billing_plans WHERE slug = 'volume_701_1500';

INSERT INTO public.billing_plan_prices (plan_id, mode, period, amount_cents, label_sub, ui_order, published_at)
SELECT id, 'one_time', 'quarterly', 21990, 'Pagamento único • Sem renovação automática', 2, now()
FROM public.billing_plans WHERE slug = 'volume_701_1500';

INSERT INTO public.billing_plan_prices (plan_id, mode, period, amount_cents, label_sub, ui_order, published_at)
SELECT id, 'one_time', 'semiannual', 39990, 'Pagamento único • Sem renovação automática', 3, now()
FROM public.billing_plans WHERE slug = 'volume_701_1500';

-- Plan: 1501 a 3000 vendas/mês
INSERT INTO public.billing_plans (slug, name, description, features, category) VALUES
  ('volume_1501_3000', '1501 a 3000 vendas/mês', 'Para operações enterprise',
   '["Dashboard completo", "Análise ABC avançada", "Relatórios detalhados", "Suporte VIP", "API de integração", "Gerente de conta dedicado"]'::jsonb, 'volume');

INSERT INTO public.billing_plan_prices (plan_id, mode, period, amount_cents, label_sub, ui_order, published_at)
SELECT id, 'one_time', 'monthly', 9990, 'Pagamento único • Sem renovação automática', 1, now()
FROM public.billing_plans WHERE slug = 'volume_1501_3000';

INSERT INTO public.billing_plan_prices (plan_id, mode, period, amount_cents, label_sub, ui_order, published_at)
SELECT id, 'one_time', 'quarterly', 26990, 'Pagamento único • Sem renovação automática', 2, now()
FROM public.billing_plans WHERE slug = 'volume_1501_3000';

INSERT INTO public.billing_plan_prices (plan_id, mode, period, amount_cents, label_sub, ui_order, published_at)
SELECT id, 'one_time', 'semiannual', 48990, 'Pagamento único • Sem renovação automática', 3, now()
FROM public.billing_plans WHERE slug = 'volume_1501_3000';

-- =============================================
-- SEED: ZPL FULL Plan
-- =============================================

INSERT INTO public.billing_plans (slug, name, description, features, category) VALUES
  ('zpl_full', 'ZPL FULL', 'Impressão ilimitada de etiquetas térmicas',
   '["Impressão ilimitada de etiquetas", "Conversão ZPL automática", "Suporte a todas as impressoras térmicas", "Modo bulk para múltiplas etiquetas"]'::jsonb, 'zpl');

-- ZPL one_time prices
INSERT INTO public.billing_plan_prices (plan_id, mode, period, amount_cents, label_sub, ui_order, published_at)
SELECT id, 'one_time', 'monthly', 2490, 'Pagamento único • Sem renovação automática', 1, now()
FROM public.billing_plans WHERE slug = 'zpl_full';

INSERT INTO public.billing_plan_prices (plan_id, mode, period, amount_cents, label_sub, ui_order, published_at)
SELECT id, 'one_time', 'quarterly', 5990, 'Pagamento único • Sem renovação automática', 2, now()
FROM public.billing_plans WHERE slug = 'zpl_full';

INSERT INTO public.billing_plan_prices (plan_id, mode, period, amount_cents, label_sub, ui_order, published_at)
SELECT id, 'one_time', 'semiannual', 9990, 'Pagamento único • Sem renovação automática', 3, now()
FROM public.billing_plans WHERE slug = 'zpl_full';

-- ZPL subscription (annual_campaign) - R$ 16,58/mês (24,90 * 10 / 12 = 20,75, mas o usuário pediu 16,58)
INSERT INTO public.billing_plan_prices (plan_id, mode, period, amount_cents, badge_text, label_sub, ui_order, published_at)
SELECT id, 'subscription', 'annual_campaign', 1658, '2 meses grátis', 'Cobrança mensal recorrente • Renovação automática • Cancele quando quiser', 10, now()
FROM public.billing_plans WHERE slug = 'zpl_full';