-- =============================================
-- MULTI-ACCOUNT SAAS - RLS + FUNCTIONS + TRIGGERS
-- =============================================

-- TRIGGERS FOR UPDATED_AT
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS set_companies_updated_at ON public.companies;
DROP TRIGGER IF EXISTS set_company_billing_updated_at ON public.company_billing;
DROP TRIGGER IF EXISTS set_marketplace_accounts_updated_at ON public.marketplace_accounts;
DROP TRIGGER IF EXISTS set_erp_integrations_updated_at ON public.erp_integrations;
DROP TRIGGER IF EXISTS set_user_context_updated_at ON public.user_context;
DROP TRIGGER IF EXISTS set_subscriptions_updated_at ON public.subscriptions;
DROP TRIGGER IF EXISTS set_invoice_queue_updated_at ON public.invoice_queue;

CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_company_billing_updated_at BEFORE UPDATE ON public.company_billing FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_marketplace_accounts_updated_at BEFORE UPDATE ON public.marketplace_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_erp_integrations_updated_at BEFORE UPDATE ON public.erp_integrations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_user_context_updated_at BEFORE UPDATE ON public.user_context FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_invoice_queue_updated_at BEFORE UPDATE ON public.invoice_queue FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- FUNCTION: Check billing completeness
CREATE OR REPLACE FUNCTION public.check_billing_completeness()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.billing_type = 'PF' THEN
    NEW.is_complete := (
      NEW.cpf IS NOT NULL AND NEW.cpf <> '' AND
      NEW.cep IS NOT NULL AND NEW.cep <> '' AND
      NEW.street IS NOT NULL AND NEW.street <> '' AND
      NEW.number IS NOT NULL AND NEW.number <> '' AND
      NEW.city IS NOT NULL AND NEW.city <> '' AND
      NEW.state IS NOT NULL AND NEW.state <> ''
    );
  ELSIF NEW.billing_type = 'PJ' THEN
    NEW.is_complete := (
      NEW.cnpj IS NOT NULL AND NEW.cnpj <> '' AND
      NEW.legal_name IS NOT NULL AND NEW.legal_name <> '' AND
      (NEW.state_registration IS NOT NULL OR NEW.state_registration_isento = true) AND
      NEW.cep IS NOT NULL AND NEW.cep <> '' AND
      NEW.street IS NOT NULL AND NEW.street <> '' AND
      NEW.number IS NOT NULL AND NEW.number <> '' AND
      NEW.city IS NOT NULL AND NEW.city <> '' AND
      NEW.state IS NOT NULL AND NEW.state <> ''
    );
  ELSE
    NEW.is_complete := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS check_company_billing_completeness ON public.company_billing;
CREATE TRIGGER check_company_billing_completeness BEFORE INSERT OR UPDATE ON public.company_billing FOR EACH ROW EXECUTE FUNCTION public.check_billing_completeness();

-- FUNCTION: Set active context with validation
CREATE OR REPLACE FUNCTION public.set_user_active_context(
  p_user_id UUID,
  p_company_id UUID DEFAULT NULL,
  p_marketplace_account_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_company_owner UUID;
  v_account_company UUID;
BEGIN
  IF p_company_id IS NOT NULL THEN
    SELECT user_id INTO v_company_owner FROM public.companies WHERE id = p_company_id AND is_active = true;
    IF v_company_owner IS NULL OR v_company_owner <> p_user_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Company not found or not owned by user');
    END IF;
  END IF;
  
  IF p_marketplace_account_id IS NOT NULL THEN
    SELECT company_id INTO v_account_company FROM public.marketplace_accounts WHERE id = p_marketplace_account_id AND is_active = true;
    IF v_account_company IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Marketplace account not found');
    END IF;
    IF p_company_id IS NOT NULL AND v_account_company <> p_company_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Marketplace account does not belong to selected company');
    END IF;
    IF p_company_id IS NULL THEN
      p_company_id := v_account_company;
      SELECT user_id INTO v_company_owner FROM public.companies WHERE id = p_company_id AND is_active = true;
      IF v_company_owner IS NULL OR v_company_owner <> p_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Account company not owned by user');
      END IF;
    END IF;
  END IF;
  
  INSERT INTO public.user_context (user_id, active_company_id, active_marketplace_account_id)
  VALUES (p_user_id, p_company_id, p_marketplace_account_id)
  ON CONFLICT (user_id) DO UPDATE SET
    active_company_id = EXCLUDED.active_company_id,
    active_marketplace_account_id = EXCLUDED.active_marketplace_account_id,
    updated_at = now();
  
  RETURN jsonb_build_object('success', true, 'active_company_id', p_company_id, 'active_marketplace_account_id', p_marketplace_account_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- FUNCTION: Initialize new user
CREATE OR REPLACE FUNCTION public.initialize_new_user(p_user_id UUID, p_email TEXT, p_full_name TEXT DEFAULT 'Usuário')
RETURNS JSONB AS $$
DECLARE
  v_profile_id UUID;
  v_company_id UUID;
  v_context_id UUID;
BEGIN
  INSERT INTO public.profiles (id, user_id, email, full_name)
  VALUES (p_user_id, p_user_id, p_email, p_full_name)
  ON CONFLICT (user_id) DO NOTHING
  RETURNING id INTO v_profile_id;
  
  INSERT INTO public.companies (user_id, display_name, billing_type)
  VALUES (p_user_id, 'Minha Empresa', 'PF')
  ON CONFLICT (user_id, display_name) DO NOTHING
  RETURNING id INTO v_company_id;
  
  IF v_company_id IS NULL THEN
    SELECT id INTO v_company_id FROM public.companies WHERE user_id = p_user_id AND display_name = 'Minha Empresa';
  END IF;
  
  INSERT INTO public.user_context (user_id, active_company_id)
  VALUES (p_user_id, v_company_id)
  ON CONFLICT (user_id) DO UPDATE SET active_company_id = COALESCE(public.user_context.active_company_id, EXCLUDED.active_company_id)
  RETURNING id INTO v_context_id;
  
  INSERT INTO public.company_billing (company_id, billing_type) VALUES (v_company_id, 'PF') ON CONFLICT (company_id) DO NOTHING;
  
  RETURN jsonb_build_object('success', true, 'profile_id', v_profile_id, 'company_id', v_company_id, 'context_id', v_context_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- FUNCTION: Get user full context
CREATE OR REPLACE FUNCTION public.get_user_full_context(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'profile', (SELECT row_to_json(p.*) FROM public.profiles p WHERE p.user_id = p_user_id),
    'context', (SELECT row_to_json(uc.*) FROM public.user_context uc WHERE uc.user_id = p_user_id),
    'companies', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'display_name', c.display_name,
          'billing_type', c.billing_type,
          'is_active', c.is_active,
          'billing', (SELECT row_to_json(cb.*) FROM public.company_billing cb WHERE cb.company_id = c.id),
          'marketplace_accounts', (SELECT COALESCE(jsonb_agg(row_to_json(ma.*)), '[]'::jsonb) FROM public.marketplace_accounts ma WHERE ma.company_id = c.id AND ma.is_active = true),
          'erp_integrations', (SELECT COALESCE(jsonb_agg(row_to_json(ei.*)), '[]'::jsonb) FROM public.erp_integrations ei WHERE ei.company_id = c.id)
        )
      ), '[]'::jsonb) FROM public.companies c WHERE c.user_id = p_user_id AND c.is_active = true
    ),
    'subscription', (SELECT row_to_json(s.*) FROM public.subscriptions s WHERE s.user_id = p_user_id ORDER BY s.created_at DESC LIMIT 1)
  ) INTO v_result;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================
-- RLS POLICIES
-- =============================================

-- Enable RLS on all new tables
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_billing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_queue ENABLE ROW LEVEL SECURITY;

-- PROFILES (may already have policies)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- COMPANIES
DROP POLICY IF EXISTS "Users can view own companies" ON public.companies;
DROP POLICY IF EXISTS "Users can insert own companies" ON public.companies;
DROP POLICY IF EXISTS "Users can update own companies" ON public.companies;
DROP POLICY IF EXISTS "Users can delete own companies" ON public.companies;
CREATE POLICY "Users can view own companies" ON public.companies FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own companies" ON public.companies FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own companies" ON public.companies FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own companies" ON public.companies FOR DELETE USING (auth.uid() = user_id);

-- COMPANY_BILLING
DROP POLICY IF EXISTS "Users can view own company billing" ON public.company_billing;
DROP POLICY IF EXISTS "Users can insert own company billing" ON public.company_billing;
DROP POLICY IF EXISTS "Users can update own company billing" ON public.company_billing;
CREATE POLICY "Users can view own company billing" ON public.company_billing FOR SELECT USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()));
CREATE POLICY "Users can insert own company billing" ON public.company_billing FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()));
CREATE POLICY "Users can update own company billing" ON public.company_billing FOR UPDATE USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()));

-- MARKETPLACE_ACCOUNTS
DROP POLICY IF EXISTS "Users can view own marketplace accounts" ON public.marketplace_accounts;
DROP POLICY IF EXISTS "Users can insert own marketplace accounts" ON public.marketplace_accounts;
DROP POLICY IF EXISTS "Users can update own marketplace accounts" ON public.marketplace_accounts;
DROP POLICY IF EXISTS "Users can delete own marketplace accounts" ON public.marketplace_accounts;
CREATE POLICY "Users can view own marketplace accounts" ON public.marketplace_accounts FOR SELECT USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()));
CREATE POLICY "Users can insert own marketplace accounts" ON public.marketplace_accounts FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()));
CREATE POLICY "Users can update own marketplace accounts" ON public.marketplace_accounts FOR UPDATE USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()));
CREATE POLICY "Users can delete own marketplace accounts" ON public.marketplace_accounts FOR DELETE USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()));

-- ERP_INTEGRATIONS
DROP POLICY IF EXISTS "Users can view own erp integrations" ON public.erp_integrations;
DROP POLICY IF EXISTS "Users can insert own erp integrations" ON public.erp_integrations;
DROP POLICY IF EXISTS "Users can update own erp integrations" ON public.erp_integrations;
DROP POLICY IF EXISTS "Users can delete own erp integrations" ON public.erp_integrations;
CREATE POLICY "Users can view own erp integrations" ON public.erp_integrations FOR SELECT USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()));
CREATE POLICY "Users can insert own erp integrations" ON public.erp_integrations FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()));
CREATE POLICY "Users can update own erp integrations" ON public.erp_integrations FOR UPDATE USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()));
CREATE POLICY "Users can delete own erp integrations" ON public.erp_integrations FOR DELETE USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()));

-- USER_CONTEXT
DROP POLICY IF EXISTS "Users can view own context" ON public.user_context;
DROP POLICY IF EXISTS "Users can insert own context" ON public.user_context;
DROP POLICY IF EXISTS "Users can update own context" ON public.user_context;
CREATE POLICY "Users can view own context" ON public.user_context FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own context" ON public.user_context FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own context" ON public.user_context FOR UPDATE USING (auth.uid() = user_id);

-- SUBSCRIPTIONS
DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can insert own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can update own subscriptions" ON public.subscriptions;
CREATE POLICY "Users can view own subscriptions" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own subscriptions" ON public.subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own subscriptions" ON public.subscriptions FOR UPDATE USING (auth.uid() = user_id);

-- PAYMENTS
DROP POLICY IF EXISTS "Users can view own payments" ON public.payments;
DROP POLICY IF EXISTS "Users can insert own payments" ON public.payments;
CREATE POLICY "Users can view own payments" ON public.payments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own payments" ON public.payments FOR INSERT WITH CHECK (auth.uid() = user_id);

-- INVOICE_QUEUE
DROP POLICY IF EXISTS "Users can view own invoice queue" ON public.invoice_queue;
DROP POLICY IF EXISTS "Users can insert own invoice queue" ON public.invoice_queue;
DROP POLICY IF EXISTS "Users can update own invoice queue" ON public.invoice_queue;
CREATE POLICY "Users can view own invoice queue" ON public.invoice_queue FOR SELECT USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()));
CREATE POLICY "Users can insert own invoice queue" ON public.invoice_queue FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()));
CREATE POLICY "Users can update own invoice queue" ON public.invoice_queue FOR UPDATE USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()));