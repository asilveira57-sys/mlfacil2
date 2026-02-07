
-- =============================================
-- TEMPLATES & THEMED LAYOUTS - Full Schema
-- =============================================

-- 1. Templates table
CREATE TABLE public.templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_system_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  scope TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'category', 'subcategory', 'seasonal', 'company')),
  owner_workspace_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage templates"
  ON public.templates FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "All authenticated users can view active templates"
  ON public.templates FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_active = true);

-- 2. Template variants table
CREATE TABLE public.template_variants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
  variant_key TEXT NOT NULL DEFAULT 'light',
  design_tokens JSONB NOT NULL DEFAULT '{}',
  preview_image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(template_id, variant_key)
);

ALTER TABLE public.template_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage template variants"
  ON public.template_variants FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "All authenticated users can view template variants"
  ON public.template_variants FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- 3. Template assets table
CREATE TABLE public.template_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('background', 'pattern', 'icon_pack', 'banner', 'logo_mark')),
  file_url TEXT NOT NULL,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.template_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage template assets"
  ON public.template_assets FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "All authenticated users can view template assets"
  ON public.template_assets FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- 4. Template rules table
CREATE TABLE public.template_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('global_default', 'company_override', 'category', 'subcategory', 'seasonal')),
  company_id UUID,
  category_key TEXT,
  subcategory_key TEXT,
  seasonal_key TEXT,
  start_month INT,
  start_day INT,
  end_month INT,
  end_day INT,
  priority INT NOT NULL DEFAULT 100,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.template_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage template rules"
  ON public.template_rules FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "All authenticated users can view enabled template rules"
  ON public.template_rules FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_enabled = true);

-- 5. Template audit log table
CREATE TABLE public.template_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_user_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'activate', 'deactivate', 'assign', 'delete_soft', 'duplicate')),
  template_id UUID REFERENCES public.templates(id) ON DELETE SET NULL,
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.template_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage audit log"
  ON public.template_audit_log FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- 6. Indexes for performance
CREATE INDEX idx_templates_scope ON public.templates(scope);
CREATE INDEX idx_templates_active ON public.templates(is_active);
CREATE INDEX idx_templates_system ON public.templates(is_system_default);
CREATE INDEX idx_template_variants_template ON public.template_variants(template_id);
CREATE INDEX idx_template_assets_template ON public.template_assets(template_id);
CREATE INDEX idx_template_rules_template ON public.template_rules(template_id);
CREATE INDEX idx_template_rules_type ON public.template_rules(rule_type);
CREATE INDEX idx_template_rules_company ON public.template_rules(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX idx_template_rules_category ON public.template_rules(category_key) WHERE category_key IS NOT NULL;
CREATE INDEX idx_template_rules_seasonal ON public.template_rules(seasonal_key) WHERE seasonal_key IS NOT NULL;
CREATE INDEX idx_template_rules_priority ON public.template_rules(priority);
CREATE INDEX idx_template_audit_template ON public.template_audit_log(template_id);
CREATE INDEX idx_template_audit_actor ON public.template_audit_log(actor_user_id);

-- 7. Updated_at triggers
CREATE TRIGGER update_templates_updated_at
  BEFORE UPDATE ON public.templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_template_variants_updated_at
  BEFORE UPDATE ON public.template_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_template_rules_updated_at
  BEFORE UPDATE ON public.template_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 8. Storage bucket for template assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('template-assets', 'template-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Template assets are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'template-assets');

CREATE POLICY "Admins can upload template assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'template-assets'
    AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update template assets"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'template-assets'
    AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete template assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'template-assets'
    AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
