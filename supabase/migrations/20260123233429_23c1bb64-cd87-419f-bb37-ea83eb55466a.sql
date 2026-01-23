-- =============================================
-- MULTI-ACCOUNT SAAS - ALTER PROFILES + CREATE TABLES
-- =============================================

-- Add new columns to existing profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cpf TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS whatsapp TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS instagram_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS other_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_cep TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_street TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_number TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_complement TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_district TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_city TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_state TEXT;

-- Make full_name NOT NULL (with default for existing rows)
UPDATE public.profiles SET full_name = 'Usuário' WHERE full_name IS NULL;
ALTER TABLE public.profiles ALTER COLUMN full_name SET NOT NULL;

-- Add unique constraint on user_id if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_user_id_key') THEN
    -- First update existing rows to have user_id = id (assuming id was the user reference)
    UPDATE public.profiles SET user_id = id WHERE user_id IS NULL;
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_cpf ON public.profiles(cpf);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- 1.2 COMPANIES
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  display_name TEXT NOT NULL,
  billing_type TEXT NOT NULL DEFAULT 'PF' CHECK (billing_type IN ('PF', 'PJ')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_company_per_user') THEN
    ALTER TABLE public.companies ADD CONSTRAINT unique_company_per_user UNIQUE (user_id, display_name);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_companies_user_id ON public.companies(user_id);

-- 1.3 COMPANY_BILLING
CREATE TABLE IF NOT EXISTS public.company_billing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  billing_type TEXT NOT NULL DEFAULT 'PF' CHECK (billing_type IN ('PF', 'PJ')),
  cpf TEXT,
  cnpj TEXT,
  legal_name TEXT,
  trade_name TEXT,
  state_registration TEXT,
  state_registration_isento BOOLEAN DEFAULT false,
  cep TEXT,
  street TEXT,
  number TEXT,
  complement TEXT,
  district TEXT,
  city TEXT,
  state TEXT,
  is_complete BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_billing_company_id_key') THEN
    ALTER TABLE public.company_billing ADD CONSTRAINT company_billing_company_id_key UNIQUE (company_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_company_billing_cpf ON public.company_billing(cpf);
CREATE INDEX IF NOT EXISTS idx_company_billing_cnpj ON public.company_billing(cnpj);

-- 1.4 MARKETPLACE_ACCOUNTS
CREATE TABLE IF NOT EXISTS public.marketplace_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'mercadolivre',
  account_label TEXT NOT NULL,
  external_user_id TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected', 'connected', 'error')),
  last_sync_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_marketplace_account') THEN
    ALTER TABLE public.marketplace_accounts ADD CONSTRAINT unique_marketplace_account UNIQUE (company_id, provider, account_label);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_marketplace_accounts_company_id ON public.marketplace_accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_accounts_provider_external ON public.marketplace_accounts(provider, external_user_id);

-- 1.5 ERP_INTEGRATIONS
CREATE TABLE IF NOT EXISTS public.erp_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('olist', 'bling')),
  api_key TEXT,
  api_user TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected', 'connected', 'error')),
  last_test_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  sync_costs BOOLEAN DEFAULT true,
  sync_orders BOOLEAN DEFAULT false,
  sync_invoicing BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_erp_per_company') THEN
    ALTER TABLE public.erp_integrations ADD CONSTRAINT unique_erp_per_company UNIQUE (company_id, provider);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_erp_integrations_company_id ON public.erp_integrations(company_id);

-- 1.6 USER_CONTEXT
CREATE TABLE IF NOT EXISTS public.user_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  active_company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  active_marketplace_account_id UUID REFERENCES public.marketplace_accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_context_user_id_key') THEN
    ALTER TABLE public.user_context ADD CONSTRAINT user_context_user_id_key UNIQUE (user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_context_company ON public.user_context(active_company_id);
CREATE INDEX IF NOT EXISTS idx_user_context_account ON public.user_context(active_marketplace_account_id);

-- 1.7 SUBSCRIPTIONS
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  plan_type TEXT NOT NULL DEFAULT 'recurring' CHECK (plan_type IN ('recurring', 'one_time')),
  plan_name TEXT,
  plan_price_cents INTEGER,
  status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('active', 'past_due', 'canceled', 'expired', 'trial')),
  gateway TEXT NOT NULL DEFAULT 'mercadopago',
  gateway_customer_id TEXT,
  gateway_subscription_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_company_id ON public.subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

-- 1.8 PAYMENTS
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  description TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'BRL',
  status TEXT NOT NULL CHECK (status IN ('paid', 'pending', 'failed', 'refunded')),
  paid_at TIMESTAMPTZ,
  gateway_payment_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_subscription_id ON public.payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_company_id ON public.payments(company_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);

-- 1.9 INVOICE_QUEUE
CREATE TABLE IF NOT EXISTS public.invoice_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'error')),
  payload JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_queue_company_id ON public.invoice_queue(company_id);
CREATE INDEX IF NOT EXISTS idx_invoice_queue_status ON public.invoice_queue(status);