
-- =============================================
-- WHOLESALE MODULE: Phase 1 + Phase 2 Tables
-- =============================================

-- 1) Profiles (5-tier templates)
CREATE TABLE public.wholesale_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  rounding_mode TEXT NOT NULL DEFAULT '2_decimals',
  margin_min_pct NUMERIC(5,2),
  allow_without_cost BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.wholesale_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wholesale_profiles_select" ON public.wholesale_profiles FOR SELECT USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "wholesale_profiles_insert" ON public.wholesale_profiles FOR INSERT WITH CHECK (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "wholesale_profiles_update" ON public.wholesale_profiles FOR UPDATE USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "wholesale_profiles_delete" ON public.wholesale_profiles FOR DELETE USING (public.is_company_member(auth.uid(), company_id));

CREATE TRIGGER trg_wholesale_profiles_updated_at BEFORE UPDATE ON public.wholesale_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Profile Tiers
CREATE TABLE public.wholesale_profile_tiers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.wholesale_profiles(id) ON DELETE CASCADE,
  tier_index INT NOT NULL,
  min_quantity INT NOT NULL DEFAULT 2,
  value_type TEXT NOT NULL DEFAULT 'PERCENT_DISCOUNT',
  value NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.wholesale_profile_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wholesale_tiers_select" ON public.wholesale_profile_tiers FOR SELECT USING (EXISTS (SELECT 1 FROM public.wholesale_profiles p WHERE p.id = profile_id AND public.is_company_member(auth.uid(), p.company_id)));
CREATE POLICY "wholesale_tiers_insert" ON public.wholesale_profile_tiers FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.wholesale_profiles p WHERE p.id = profile_id AND public.is_company_member(auth.uid(), p.company_id)));
CREATE POLICY "wholesale_tiers_update" ON public.wholesale_profile_tiers FOR UPDATE USING (EXISTS (SELECT 1 FROM public.wholesale_profiles p WHERE p.id = profile_id AND public.is_company_member(auth.uid(), p.company_id)));
CREATE POLICY "wholesale_tiers_delete" ON public.wholesale_profile_tiers FOR DELETE USING (EXISTS (SELECT 1 FROM public.wholesale_profiles p WHERE p.id = profile_id AND public.is_company_member(auth.uid(), p.company_id)));

CREATE TRIGGER trg_wholesale_tiers_updated_at BEFORE UPDATE ON public.wholesale_profile_tiers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Seller Settings
CREATE TABLE public.wholesale_seller_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  strategy_mode TEXT NOT NULL DEFAULT 'by_category',
  default_profile_id UUID REFERENCES public.wholesale_profiles(id) ON DELETE SET NULL,
  auto_reapply_on_price_change BOOLEAN NOT NULL DEFAULT false,
  auto_reapply_mode TEXT NOT NULL DEFAULT 'immediate',
  scheduled_time TEXT NOT NULL DEFAULT '03:00',
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.wholesale_seller_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wholesale_settings_select" ON public.wholesale_seller_settings FOR SELECT USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "wholesale_settings_insert" ON public.wholesale_seller_settings FOR INSERT WITH CHECK (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "wholesale_settings_update" ON public.wholesale_seller_settings FOR UPDATE USING (public.is_company_member(auth.uid(), company_id));

CREATE TRIGGER trg_wholesale_settings_updated_at BEFORE UPDATE ON public.wholesale_seller_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Profile ↔ Category bindings
CREATE TABLE public.wholesale_profile_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.wholesale_profiles(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL,
  category_name TEXT,
  category_path TEXT[],
  priority INT NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, category_id)
);

ALTER TABLE public.wholesale_profile_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wholesale_cat_select" ON public.wholesale_profile_categories FOR SELECT USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "wholesale_cat_insert" ON public.wholesale_profile_categories FOR INSERT WITH CHECK (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "wholesale_cat_update" ON public.wholesale_profile_categories FOR UPDATE USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "wholesale_cat_delete" ON public.wholesale_profile_categories FOR DELETE USING (public.is_company_member(auth.uid(), company_id));

CREATE INDEX idx_wholesale_cat_company ON public.wholesale_profile_categories(company_id);
CREATE INDEX idx_wholesale_cat_profile ON public.wholesale_profile_categories(profile_id);

CREATE TRIGGER trg_wholesale_cat_updated_at BEFORE UPDATE ON public.wholesale_profile_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Product-level overrides
CREATE TABLE public.wholesale_product_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.wholesale_profiles(id) ON DELETE SET NULL,
  item_id TEXT NOT NULL,
  product_key TEXT,
  title TEXT,
  override_mode TEXT NOT NULL DEFAULT 'use_profile',
  custom_tiers JSONB,
  is_excluded BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, item_id)
);

ALTER TABLE public.wholesale_product_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wholesale_override_select" ON public.wholesale_product_overrides FOR SELECT USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "wholesale_override_insert" ON public.wholesale_product_overrides FOR INSERT WITH CHECK (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "wholesale_override_update" ON public.wholesale_product_overrides FOR UPDATE USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "wholesale_override_delete" ON public.wholesale_product_overrides FOR DELETE USING (public.is_company_member(auth.uid(), company_id));

CREATE INDEX idx_wholesale_override_company ON public.wholesale_product_overrides(company_id);
CREATE INDEX idx_wholesale_override_profile ON public.wholesale_product_overrides(profile_id);
CREATE INDEX idx_wholesale_override_item ON public.wholesale_product_overrides(item_id);

CREATE TRIGGER trg_wholesale_override_updated_at BEFORE UPDATE ON public.wholesale_product_overrides FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
