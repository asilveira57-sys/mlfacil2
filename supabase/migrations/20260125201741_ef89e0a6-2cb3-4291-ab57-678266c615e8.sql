-- =============================================
-- CLEANUP: Drop ALL related tables (including legacy 'plans')
-- =============================================

DROP VIEW IF EXISTS public.public_plans_v1 CASCADE;
DROP TABLE IF EXISTS public.checkout_logs CASCADE;
DROP TABLE IF EXISTS public.billing_provider_map CASCADE;
DROP TABLE IF EXISTS public.billing_plan_prices CASCADE;
DROP TABLE IF EXISTS public.billing_plans CASCADE;
DROP TABLE IF EXISTS public.billing_settings CASCADE;
DROP TABLE IF EXISTS public.plan_prices CASCADE;
DROP TABLE IF EXISTS public.plan_settings CASCADE;
DROP TABLE IF EXISTS public.plans CASCADE;

-- =============================================
-- NEW TABLE: plans
-- =============================================

CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('volume', 'zpl')),
  description TEXT,
  features JSONB NOT NULL DEFAULT '[]'::JSONB,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for category queries
CREATE INDEX idx_plans_category_active_sort ON public.plans(category, active, sort_order);

-- Trigger to auto-update updated_at
CREATE TRIGGER update_plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- NEW TABLE: plan_prices
-- =============================================

CREATE TABLE public.plan_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('avulso', 'assinatura')),
  period TEXT NOT NULL CHECK (period IN ('mensal', 'trimestral', 'semestral', 'anual')),
  price_cents INT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  recurring BOOLEAN NOT NULL DEFAULT false,
  auto_renew BOOLEAN NOT NULL DEFAULT false,
  badge_text TEXT,
  visible BOOLEAN NOT NULL DEFAULT true,
  is_campaign BOOLEAN NOT NULL DEFAULT false,
  campaign_notes TEXT,
  mp_preapproval_plan_id TEXT,
  mp_checkout_url TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for plan_prices
CREATE INDEX idx_plan_prices_plan_id ON public.plan_prices(plan_id);
CREATE INDEX idx_plan_prices_mode_period ON public.plan_prices(mode, period);

-- Trigger to auto-update updated_at
CREATE TRIGGER update_plan_prices_updated_at
  BEFORE UPDATE ON public.plan_prices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- NEW TABLE: plan_settings (global config)
-- =============================================

CREATE TABLE public.plan_settings (
  key TEXT PRIMARY KEY DEFAULT 'global',
  enable_annual_campaign BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default global settings
INSERT INTO public.plan_settings (key, enable_annual_campaign) VALUES ('global', false);

-- Trigger to auto-update updated_at
CREATE TRIGGER update_plan_settings_updated_at
  BEFORE UPDATE ON public.plan_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- TABLE: checkout_logs (for MP checkout tracking)
-- =============================================

CREATE TABLE public.checkout_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  plan_price_id UUID REFERENCES public.plan_prices(id),
  provider TEXT NOT NULL DEFAULT 'mercado_pago',
  provider_mode TEXT,
  provider_id TEXT,
  status TEXT NOT NULL DEFAULT 'created',
  request_payload JSONB,
  response_payload JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- RLS POLICIES
-- =============================================

-- plans: public read, no direct write (admin via edge function)
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Plans are readable by everyone"
  ON public.plans FOR SELECT
  USING (true);

-- plan_prices: public read, no direct write
ALTER TABLE public.plan_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Plan prices are readable by everyone"
  ON public.plan_prices FOR SELECT
  USING (true);

-- plan_settings: public read, no direct write
ALTER TABLE public.plan_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Plan settings are readable by everyone"
  ON public.plan_settings FOR SELECT
  USING (true);

-- checkout_logs: users can see their own
ALTER TABLE public.checkout_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own checkout logs"
  ON public.checkout_logs FOR SELECT
  USING (auth.uid() = user_id);

-- =============================================
-- VIEW: public_plans_v1 (for easy frontend querying)
-- =============================================

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
  pp.sort_order AS price_sort_order
FROM public.plans p
LEFT JOIN public.plan_prices pp ON pp.plan_id = p.id
WHERE p.active = true
ORDER BY p.category, p.sort_order, pp.sort_order;

-- =============================================
-- SEED DATA: Volume Plans
-- =============================================

-- Plan: Até 50 vendas
INSERT INTO public.plans (slug, name, category, description, features, sort_order)
VALUES (
  'ate-50-vendas',
  'Até 50 vendas',
  'volume',
  'Ideal para quem está começando',
  '["Dashboard completo", "Sincronização automática", "Relatórios básicos"]'::JSONB,
  1
);

-- Plan: 51-300 vendas
INSERT INTO public.plans (slug, name, category, description, features, sort_order)
VALUES (
  '51-300-vendas',
  '51 a 300 vendas',
  'volume',
  'Para vendedores em crescimento',
  '["Dashboard completo", "Sincronização automática", "Relatórios avançados", "Suporte prioritário"]'::JSONB,
  2
);

-- Plan: 301-700 vendas
INSERT INTO public.plans (slug, name, category, description, features, sort_order)
VALUES (
  '301-700-vendas',
  '301 a 700 vendas',
  'volume',
  'Para operações estabelecidas',
  '["Dashboard completo", "Sincronização automática", "Relatórios avançados", "Suporte prioritário", "Análise de concorrência"]'::JSONB,
  3
);

-- Plan: 701-1500 vendas
INSERT INTO public.plans (slug, name, category, description, features, sort_order)
VALUES (
  '701-1500-vendas',
  '701 a 1500 vendas',
  'volume',
  'Para grandes vendedores',
  '["Dashboard completo", "Sincronização automática", "Relatórios avançados", "Suporte prioritário", "Análise de concorrência", "API access"]'::JSONB,
  4
);

-- Plan: 1501-3000 vendas
INSERT INTO public.plans (slug, name, category, description, features, sort_order)
VALUES (
  '1501-3000-vendas',
  '1501 a 3000 vendas',
  'volume',
  'Para operações de alto volume',
  '["Dashboard completo", "Sincronização automática", "Relatórios avançados", "Suporte prioritário", "Análise de concorrência", "API access", "Account manager dedicado"]'::JSONB,
  5
);

-- Plan: ZPL FULL
INSERT INTO public.plans (slug, name, category, description, features, sort_order)
VALUES (
  'zpl-full',
  'ZPL FULL',
  'zpl',
  'Impressão de etiquetas ZPL ilimitada. Sem limite de impressão, use à vontade.',
  '["Impressão ZPL ilimitada", "Suporte a todas impressoras térmicas", "Configuração personalizável", "Sem limite mensal"]'::JSONB,
  1
);

-- =============================================
-- SEED DATA: Plan Prices (Volume - Avulso)
-- =============================================

-- Até 50 vendas - Avulso
INSERT INTO public.plan_prices (plan_id, mode, period, price_cents, recurring, auto_renew, sort_order)
SELECT id, 'avulso', 'mensal', 1990, false, false, 1 FROM public.plans WHERE slug = 'ate-50-vendas';

INSERT INTO public.plan_prices (plan_id, mode, period, price_cents, recurring, auto_renew, badge_text, sort_order)
SELECT id, 'avulso', 'trimestral', 4990, false, false, 'Economia de R$ 9,80', 2 FROM public.plans WHERE slug = 'ate-50-vendas';

INSERT INTO public.plan_prices (plan_id, mode, period, price_cents, recurring, auto_renew, badge_text, sort_order)
SELECT id, 'avulso', 'semestral', 8990, false, false, 'Economia de R$ 29,50', 3 FROM public.plans WHERE slug = 'ate-50-vendas';

-- 51-300 vendas - Avulso
INSERT INTO public.plan_prices (plan_id, mode, period, price_cents, recurring, auto_renew, sort_order)
SELECT id, 'avulso', 'mensal', 4990, false, false, 1 FROM public.plans WHERE slug = '51-300-vendas';

INSERT INTO public.plan_prices (plan_id, mode, period, price_cents, recurring, auto_renew, badge_text, sort_order)
SELECT id, 'avulso', 'trimestral', 12990, false, false, 'Economia de R$ 19,80', 2 FROM public.plans WHERE slug = '51-300-vendas';

INSERT INTO public.plan_prices (plan_id, mode, period, price_cents, recurring, auto_renew, badge_text, sort_order)
SELECT id, 'avulso', 'semestral', 23990, false, false, 'Economia de R$ 59,50', 3 FROM public.plans WHERE slug = '51-300-vendas';

-- 301-700 vendas - Avulso
INSERT INTO public.plan_prices (plan_id, mode, period, price_cents, recurring, auto_renew, sort_order)
SELECT id, 'avulso', 'mensal', 9990, false, false, 1 FROM public.plans WHERE slug = '301-700-vendas';

INSERT INTO public.plan_prices (plan_id, mode, period, price_cents, recurring, auto_renew, badge_text, sort_order)
SELECT id, 'avulso', 'trimestral', 26990, false, false, 'Economia de R$ 29,80', 2 FROM public.plans WHERE slug = '301-700-vendas';

INSERT INTO public.plan_prices (plan_id, mode, period, price_cents, recurring, auto_renew, badge_text, sort_order)
SELECT id, 'avulso', 'semestral', 49990, false, false, 'Economia de R$ 99,50', 3 FROM public.plans WHERE slug = '301-700-vendas';

-- 701-1500 vendas - Avulso
INSERT INTO public.plan_prices (plan_id, mode, period, price_cents, recurring, auto_renew, sort_order)
SELECT id, 'avulso', 'mensal', 14990, false, false, 1 FROM public.plans WHERE slug = '701-1500-vendas';

INSERT INTO public.plan_prices (plan_id, mode, period, price_cents, recurring, auto_renew, badge_text, sort_order)
SELECT id, 'avulso', 'trimestral', 39990, false, false, 'Economia de R$ 49,80', 2 FROM public.plans WHERE slug = '701-1500-vendas';

INSERT INTO public.plan_prices (plan_id, mode, period, price_cents, recurring, auto_renew, badge_text, sort_order)
SELECT id, 'avulso', 'semestral', 74990, false, false, 'Economia de R$ 149,50', 3 FROM public.plans WHERE slug = '701-1500-vendas';

-- 1501-3000 vendas - Avulso
INSERT INTO public.plan_prices (plan_id, mode, period, price_cents, recurring, auto_renew, sort_order)
SELECT id, 'avulso', 'mensal', 24990, false, false, 1 FROM public.plans WHERE slug = '1501-3000-vendas';

INSERT INTO public.plan_prices (plan_id, mode, period, price_cents, recurring, auto_renew, badge_text, sort_order)
SELECT id, 'avulso', 'trimestral', 66990, false, false, 'Economia de R$ 79,80', 2 FROM public.plans WHERE slug = '1501-3000-vendas';

INSERT INTO public.plan_prices (plan_id, mode, period, price_cents, recurring, auto_renew, badge_text, sort_order)
SELECT id, 'avulso', 'semestral', 124990, false, false, 'Economia de R$ 249,50', 3 FROM public.plans WHERE slug = '1501-3000-vendas';

-- =============================================
-- SEED DATA: Plan Prices (Volume - Assinatura)
-- =============================================

-- Até 50 vendas - Assinatura Mensal
INSERT INTO public.plan_prices (plan_id, mode, period, price_cents, recurring, auto_renew, sort_order)
SELECT id, 'assinatura', 'mensal', 1790, true, true, 10 FROM public.plans WHERE slug = 'ate-50-vendas';

-- Até 50 vendas - Assinatura Anual (campanha)
INSERT INTO public.plan_prices (plan_id, mode, period, price_cents, recurring, auto_renew, badge_text, is_campaign, campaign_notes, sort_order)
SELECT id, 'assinatura', 'anual', 1491, true, true, '2 meses grátis', true, 'Pague 10, use 12', 11 FROM public.plans WHERE slug = 'ate-50-vendas';

-- 51-300 vendas - Assinatura
INSERT INTO public.plan_prices (plan_id, mode, period, price_cents, recurring, auto_renew, sort_order)
SELECT id, 'assinatura', 'mensal', 4490, true, true, 10 FROM public.plans WHERE slug = '51-300-vendas';

INSERT INTO public.plan_prices (plan_id, mode, period, price_cents, recurring, auto_renew, badge_text, is_campaign, campaign_notes, sort_order)
SELECT id, 'assinatura', 'anual', 3741, true, true, '2 meses grátis', true, 'Pague 10, use 12', 11 FROM public.plans WHERE slug = '51-300-vendas';

-- 301-700 vendas - Assinatura
INSERT INTO public.plan_prices (plan_id, mode, period, price_cents, recurring, auto_renew, sort_order)
SELECT id, 'assinatura', 'mensal', 8990, true, true, 10 FROM public.plans WHERE slug = '301-700-vendas';

INSERT INTO public.plan_prices (plan_id, mode, period, price_cents, recurring, auto_renew, badge_text, is_campaign, campaign_notes, sort_order)
SELECT id, 'assinatura', 'anual', 7491, true, true, '2 meses grátis', true, 'Pague 10, use 12', 11 FROM public.plans WHERE slug = '301-700-vendas';

-- 701-1500 vendas - Assinatura
INSERT INTO public.plan_prices (plan_id, mode, period, price_cents, recurring, auto_renew, sort_order)
SELECT id, 'assinatura', 'mensal', 13490, true, true, 10 FROM public.plans WHERE slug = '701-1500-vendas';

INSERT INTO public.plan_prices (plan_id, mode, period, price_cents, recurring, auto_renew, badge_text, is_campaign, campaign_notes, sort_order)
SELECT id, 'assinatura', 'anual', 11241, true, true, '2 meses grátis', true, 'Pague 10, use 12', 11 FROM public.plans WHERE slug = '701-1500-vendas';

-- 1501-3000 vendas - Assinatura
INSERT INTO public.plan_prices (plan_id, mode, period, price_cents, recurring, auto_renew, sort_order)
SELECT id, 'assinatura', 'mensal', 22490, true, true, 10 FROM public.plans WHERE slug = '1501-3000-vendas';

INSERT INTO public.plan_prices (plan_id, mode, period, price_cents, recurring, auto_renew, badge_text, is_campaign, campaign_notes, sort_order)
SELECT id, 'assinatura', 'anual', 18741, true, true, '2 meses grátis', true, 'Pague 10, use 12', 11 FROM public.plans WHERE slug = '1501-3000-vendas';

-- =============================================
-- SEED DATA: Plan Prices (ZPL FULL)
-- =============================================

-- ZPL FULL - Avulso
INSERT INTO public.plan_prices (plan_id, mode, period, price_cents, recurring, auto_renew, sort_order)
SELECT id, 'avulso', 'mensal', 2490, false, false, 1 FROM public.plans WHERE slug = 'zpl-full';

INSERT INTO public.plan_prices (plan_id, mode, period, price_cents, recurring, auto_renew, badge_text, sort_order)
SELECT id, 'avulso', 'trimestral', 5990, false, false, 'Economia de R$ 14,80', 2 FROM public.plans WHERE slug = 'zpl-full';

INSERT INTO public.plan_prices (plan_id, mode, period, price_cents, recurring, auto_renew, badge_text, sort_order)
SELECT id, 'avulso', 'semestral', 9990, false, false, 'Economia de R$ 49,50', 3 FROM public.plans WHERE slug = 'zpl-full';

-- ZPL FULL - Assinatura Anual (campanha) - R$ 16,58/mês equivalente (pague 10 use 12 do mensal 24,90)
INSERT INTO public.plan_prices (plan_id, mode, period, price_cents, recurring, auto_renew, badge_text, is_campaign, campaign_notes, sort_order)
SELECT id, 'assinatura', 'anual', 1658, true, true, '2 meses grátis', true, 'Pague 10, use 12', 10 FROM public.plans WHERE slug = 'zpl-full';