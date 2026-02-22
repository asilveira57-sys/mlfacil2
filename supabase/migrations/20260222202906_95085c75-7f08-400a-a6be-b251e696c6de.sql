
-- PARTE 1: Alterações de schema

-- 1. templates: slug + source_group_id
ALTER TABLE public.templates 
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS source_group_id uuid REFERENCES public.visual_category_groups(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_templates_slug ON public.templates(slug) WHERE slug IS NOT NULL;

-- Preencher slugs existentes
UPDATE public.templates SET slug = 'sistema-padrao' WHERE id = 'a0000000-0000-0000-0000-000000000001' AND slug IS NULL;
UPDATE public.templates SET slug = 'embalagem' WHERE id = 'a0000000-0000-0000-0000-000000000002' AND slug IS NULL;
UPDATE public.templates SET slug = 'papelaria-criativa' WHERE id = 'a0000000-0000-0000-0000-000000000003' AND slug IS NULL;
UPDATE public.templates SET slug = 'marketplace-ads' WHERE id = 'a0000000-0000-0000-0000-000000000004' AND slug IS NULL;
UPDATE public.templates SET slug = 'natal' WHERE id = 'a0000000-0000-0000-0000-000000000010' AND slug IS NULL;
UPDATE public.templates SET slug = 'ano-novo' WHERE id = 'a0000000-0000-0000-0000-000000000011' AND slug IS NULL;
UPDATE public.templates SET slug = 'carnaval' WHERE id = 'a0000000-0000-0000-0000-000000000012' AND slug IS NULL;

-- 2. template_variants: overlay_url, overlay_opacity, intensity
ALTER TABLE public.template_variants 
  ADD COLUMN IF NOT EXISTS overlay_url text,
  ADD COLUMN IF NOT EXISTS overlay_opacity numeric DEFAULT 0.85,
  ADD COLUMN IF NOT EXISTS intensity integer DEFAULT 4;

-- 3. template_rules: match_categories, source_group_id
ALTER TABLE public.template_rules 
  ADD COLUMN IF NOT EXISTS match_categories text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source_group_id uuid REFERENCES public.visual_category_groups(id) ON DELETE SET NULL;

-- 4. seller_visual_preferences
CREATE TABLE IF NOT EXISTS public.seller_visual_preferences (
  seller_id text PRIMARY KEY,
  user_id uuid NOT NULL,
  mode text NOT NULL DEFAULT 'auto',
  fixed_template_id uuid REFERENCES public.templates(id) ON DELETE SET NULL,
  allow_seasonal boolean NOT NULL DEFAULT true,
  allow_category boolean NOT NULL DEFAULT true,
  preferred_intensity integer NOT NULL DEFAULT 4,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.seller_visual_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own visual preferences"
  ON public.seller_visual_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own visual preferences"
  ON public.seller_visual_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own visual preferences"
  ON public.seller_visual_preferences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_seller_visual_preferences_updated_at
  BEFORE UPDATE ON public.seller_visual_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
