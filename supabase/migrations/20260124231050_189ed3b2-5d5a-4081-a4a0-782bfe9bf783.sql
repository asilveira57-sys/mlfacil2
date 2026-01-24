-- ==============================================
-- PLANOS E ASSINATURAS - COMPLEMENTO
-- ==============================================

-- Enum para tipo de plano (se não existir)
DO $$ BEGIN
  CREATE TYPE public.plan_type_enum AS ENUM ('volume', 'zpl_full');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Enum para ciclo de cobrança
DO $$ BEGIN
  CREATE TYPE public.billing_cycle AS ENUM ('monthly', 'quarterly', 'semiannual', 'annual');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ==============================================
-- TABELA: plans (definição dos planos)
-- ==============================================
CREATE TABLE IF NOT EXISTS public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  plan_type TEXT NOT NULL DEFAULT 'volume',
  name TEXT NOT NULL,
  description TEXT,
  min_sales INTEGER,
  max_sales INTEGER,
  features JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================
-- TABELA: plan_prices (preços por ciclo)
-- ==============================================
CREATE TABLE IF NOT EXISTS public.plan_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES public.plans(id) ON DELETE CASCADE NOT NULL,
  billing_cycle TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  duration_days INTEGER NOT NULL,
  mercadopago_plan_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(plan_id, billing_cycle)
);

-- ==============================================
-- TABELA: vouchers (códigos promocionais)
-- ==============================================
CREATE TABLE IF NOT EXISTS public.vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  discount_type TEXT NOT NULL DEFAULT 'percent',
  discount_value INTEGER NOT NULL,
  max_uses INTEGER,
  current_uses INTEGER DEFAULT 0,
  valid_from TIMESTAMPTZ DEFAULT now(),
  valid_until TIMESTAMPTZ,
  plan_ids UUID[],
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================
-- TABELA: user_usage (controle de uso mensal)
-- ==============================================
CREATE TABLE IF NOT EXISTS public.user_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  month_key TEXT NOT NULL,
  total_sales INTEGER DEFAULT 0,
  last_calculated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, month_key)
);

-- ==============================================
-- Adicionar colunas à subscriptions existente
-- ==============================================
ALTER TABLE public.subscriptions 
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES public.plans(id),
  ADD COLUMN IF NOT EXISTS plan_price_id UUID,
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT,
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN DEFAULT true;

-- Adicionar colunas à payments existente
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS subscription_id UUID,
  ADD COLUMN IF NOT EXISTS voucher_id UUID REFERENCES public.vouchers(id),
  ADD COLUMN IF NOT EXISTS amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS discount_cents INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS mercadopago_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS mercadopago_status TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- ==============================================
-- RLS POLICIES
-- ==============================================

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_usage ENABLE ROW LEVEL SECURITY;

-- Plans: leitura pública, escrita apenas admin
DROP POLICY IF EXISTS "Plans are publicly readable" ON public.plans;
CREATE POLICY "Plans are publicly readable"
  ON public.plans FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage plans" ON public.plans;
CREATE POLICY "Admins can manage plans"
  ON public.plans FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Plan prices: leitura pública
DROP POLICY IF EXISTS "Plan prices are publicly readable" ON public.plan_prices;
CREATE POLICY "Plan prices are publicly readable"
  ON public.plan_prices FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage plan prices" ON public.plan_prices;
CREATE POLICY "Admins can manage plan prices"
  ON public.plan_prices FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Vouchers: leitura para validação
DROP POLICY IF EXISTS "Anyone can validate vouchers" ON public.vouchers;
CREATE POLICY "Anyone can validate vouchers"
  ON public.vouchers FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage vouchers" ON public.vouchers;
CREATE POLICY "Admins can manage vouchers"
  ON public.vouchers FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- User usage: usuário vê o próprio
DROP POLICY IF EXISTS "Users can view own usage" ON public.user_usage;
CREATE POLICY "Users can view own usage"
  ON public.user_usage FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage usage" ON public.user_usage;
CREATE POLICY "Admins can manage usage"
  ON public.user_usage FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- ==============================================
-- TRIGGERS para updated_at
-- ==============================================

DROP TRIGGER IF EXISTS update_plans_updated_at ON public.plans;
CREATE TRIGGER update_plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_plan_prices_updated_at ON public.plan_prices;
CREATE TRIGGER update_plan_prices_updated_at
  BEFORE UPDATE ON public.plan_prices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_usage_updated_at ON public.user_usage;
CREATE TRIGGER update_user_usage_updated_at
  BEFORE UPDATE ON public.user_usage
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==============================================
-- DADOS INICIAIS: Planos por Volume
-- ==============================================

INSERT INTO public.plans (code, plan_type, name, description, min_sales, max_sales, features, sort_order) VALUES
('volume_50', 'volume', 'Até 50 vendas/mês', 'Ideal para quem vende pouco, mas quer organização desde o início.', 0, 50, '["Até 50 vendas por mês", "Multicontas liberado", "Histórico retroativo de 12 meses", "Dashboard completo", "Análise ABC"]'::jsonb, 1),
('volume_300', 'volume', '51 a 300 vendas/mês', 'Para operações em crescimento constante.', 51, 300, '["De 51 a 300 vendas mensais", "Multicontas com volume consolidado", "Histórico retroativo de 12 meses", "Dashboard completo", "Análise ABC", "Tendências de mercado"]'::jsonb, 2),
('volume_700', 'volume', '301 a 700 vendas/mês', 'Para quem já tem volume diário relevante.', 301, 700, '["De 301 a 700 vendas por mês", "Multicontas ilimitado", "Histórico retroativo de 12 meses", "Dashboard completo", "Análise ABC", "Tendências de mercado", "Análise de custos"]'::jsonb, 3),
('volume_1500', 'volume', '701 a 1.500 vendas/mês', 'Para operações consolidadas.', 701, 1500, '["Até 1.500 vendas mensais", "Multicontas ilimitado", "Histórico retroativo de 12 meses", "Todos os recursos", "Suporte prioritário"]'::jsonb, 4),
('volume_3000', 'volume', '1.501 a 3.000 vendas/mês', 'Para grandes operações.', 1501, 3000, '["Até 3.000 vendas mensais", "Multicontas ilimitado", "Histórico retroativo de 12 meses", "Todos os recursos", "Suporte prioritário"]'::jsonb, 5),
('volume_custom', 'volume', 'Acima de 3.000 vendas', 'Plano sob consulta para operações enterprise.', 3001, NULL, '["Volume personalizado", "Multicontas ilimitado", "Histórico retroativo de 12 meses", "Todos os recursos", "Suporte dedicado", "SLA personalizado"]'::jsonb, 6),
('zpl_full', 'zpl_full', 'ZPL FULL', 'Para quem precisa apenas gerar e imprimir etiquetas, sem login em marketplaces.', NULL, NULL, '["Upload de arquivos ZPL, TXT ou CSV", "Colar código ZPL diretamente", "Pré-visualização de etiquetas", "Compatível com ML FULL e Shopee", "Sem login em marketplaces", "Sem limite de etiquetas"]'::jsonb, 10)
ON CONFLICT (code) DO NOTHING;

-- ==============================================
-- DADOS INICIAIS: Preços (usando subquery)
-- ==============================================

-- Mensais
INSERT INTO public.plan_prices (plan_id, billing_cycle, price_cents, duration_days)
SELECT p.id, 'monthly', 
  CASE p.code 
    WHEN 'volume_50' THEN 2490
    WHEN 'volume_300' THEN 3490
    WHEN 'volume_700' THEN 4990
    WHEN 'volume_1500' THEN 7990
    WHEN 'volume_3000' THEN 9990
    WHEN 'zpl_full' THEN 1990
  END, 
  30
FROM public.plans p
WHERE p.code IN ('volume_50', 'volume_300', 'volume_700', 'volume_1500', 'volume_3000', 'zpl_full')
ON CONFLICT (plan_id, billing_cycle) DO NOTHING;

-- Trimestrais
INSERT INTO public.plan_prices (plan_id, billing_cycle, price_cents, duration_days)
SELECT p.id, 'quarterly', 
  CASE p.code 
    WHEN 'volume_50' THEN 6990
    WHEN 'volume_300' THEN 9990
    WHEN 'volume_700' THEN 13990
    WHEN 'volume_1500' THEN 21990
    WHEN 'volume_3000' THEN 26990
    WHEN 'zpl_full' THEN 4990
  END, 
  90
FROM public.plans p
WHERE p.code IN ('volume_50', 'volume_300', 'volume_700', 'volume_1500', 'volume_3000', 'zpl_full')
ON CONFLICT (plan_id, billing_cycle) DO NOTHING;

-- Semestrais
INSERT INTO public.plan_prices (plan_id, billing_cycle, price_cents, duration_days)
SELECT p.id, 'semiannual', 
  CASE p.code 
    WHEN 'volume_50' THEN 12990
    WHEN 'volume_300' THEN 18990
    WHEN 'volume_700' THEN 26990
    WHEN 'volume_1500' THEN 39990
    WHEN 'volume_3000' THEN 48990
    WHEN 'zpl_full' THEN 8990
  END, 
  180
FROM public.plans p
WHERE p.code IN ('volume_50', 'volume_300', 'volume_700', 'volume_1500', 'volume_3000', 'zpl_full')
ON CONFLICT (plan_id, billing_cycle) DO NOTHING;

-- ==============================================
-- FUNÇÃO: Verificar assinatura ativa do usuário
-- ==============================================

CREATE OR REPLACE FUNCTION public.get_user_subscription(p_user_id UUID)
RETURNS TABLE (
  subscription_id UUID,
  plan_code TEXT,
  plan_name TEXT,
  plan_type TEXT,
  status TEXT,
  max_sales INTEGER,
  current_period_end TIMESTAMPTZ,
  is_trial BOOLEAN,
  days_remaining INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id as subscription_id,
    COALESCE(p.code, s.plan_type) as plan_code,
    COALESCE(p.name, s.plan_name) as plan_name,
    COALESCE(p.plan_type, 'volume') as plan_type,
    s.status,
    p.max_sales,
    s.current_period_end,
    s.status = 'trial' as is_trial,
    GREATEST(0, EXTRACT(DAY FROM (COALESCE(s.current_period_end, s.trial_ends_at) - now())))::INTEGER as days_remaining
  FROM public.subscriptions s
  LEFT JOIN public.plans p ON p.id = s.plan_id
  WHERE s.user_id = p_user_id
    AND s.status IN ('trial', 'active')
    AND (
      (s.status = 'trial' AND s.trial_ends_at > now()) OR
      (s.status = 'active' AND s.current_period_end > now()) OR
      (s.current_period_end > now())
    )
  ORDER BY s.created_at DESC
  LIMIT 1;
END;
$$;

-- ==============================================
-- FUNÇÃO: Iniciar trial para novo usuário
-- ==============================================

CREATE OR REPLACE FUNCTION public.start_user_trial(p_user_id UUID, p_plan_code TEXT DEFAULT 'volume_300')
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id UUID;
  v_subscription_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM public.subscriptions WHERE user_id = p_user_id) THEN
    RETURN NULL;
  END IF;
  
  SELECT id INTO v_plan_id FROM public.plans WHERE code = p_plan_code AND is_active = true;
  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Plan not found: %', p_plan_code;
  END IF;
  
  INSERT INTO public.subscriptions (
    user_id, 
    plan_id,
    plan_type,
    plan_name,
    status, 
    trial_started_at, 
    trial_ends_at
  ) VALUES (
    p_user_id,
    v_plan_id,
    'volume',
    (SELECT name FROM public.plans WHERE id = v_plan_id),
    'trial',
    now(),
    now() + interval '14 days'
  ) RETURNING id INTO v_subscription_id;
  
  RETURN v_subscription_id;
END;
$$;