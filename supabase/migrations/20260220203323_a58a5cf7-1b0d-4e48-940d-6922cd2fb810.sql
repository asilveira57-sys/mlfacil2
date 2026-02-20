
-- ============================================================
-- FASE 1: Novo schema de avaliações/feedback
-- ============================================================

-- 1) module_feedback — avaliações por módulo (contextual)
CREATE TABLE public.module_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL,
  user_id UUID NOT NULL,
  module_slug TEXT NOT NULL,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  tags TEXT[],
  status TEXT NOT NULL DEFAULT 'submitted',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, seller_id, module_slug)
);

CREATE INDEX idx_module_feedback_seller ON public.module_feedback (seller_id);
CREATE INDEX idx_module_feedback_user ON public.module_feedback (user_id);
CREATE INDEX idx_module_feedback_module ON public.module_feedback (module_slug);
CREATE INDEX idx_module_feedback_rating ON public.module_feedback (rating);

ALTER TABLE public.module_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own module feedback"
  ON public.module_feedback FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own module feedback"
  ON public.module_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own module feedback"
  ON public.module_feedback FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all module feedback"
  ON public.module_feedback FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update all module feedback"
  ON public.module_feedback FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_module_feedback_updated_at
  BEFORE UPDATE ON public.module_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) system_feedback — avaliação geral do sistema
CREATE TABLE public.system_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL,
  user_id UUID NOT NULL,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  nps INT CHECK (nps IS NULL OR (nps BETWEEN 0 AND 10)),
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, seller_id)
);

CREATE INDEX idx_system_feedback_seller ON public.system_feedback (seller_id);
CREATE INDEX idx_system_feedback_user ON public.system_feedback (user_id);
CREATE INDEX idx_system_feedback_rating ON public.system_feedback (rating);

ALTER TABLE public.system_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own system feedback"
  ON public.system_feedback FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own system feedback"
  ON public.system_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own system feedback"
  ON public.system_feedback FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all system feedback"
  ON public.system_feedback FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update all system feedback"
  ON public.system_feedback FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_system_feedback_updated_at
  BEFORE UPDATE ON public.system_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) testimonials — depoimentos publicáveis
CREATE TABLE public.testimonials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  source_id UUID,
  display_name TEXT NOT NULL,
  company_name TEXT,
  role TEXT,
  avatar_url TEXT,
  quote TEXT NOT NULL,
  rating INT CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5)),
  featured BOOLEAN NOT NULL DEFAULT false,
  published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  consent_requested_at TIMESTAMPTZ,
  consent_granted_at TIMESTAMPTZ,
  consent_status TEXT DEFAULT 'none',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_testimonials_seller ON public.testimonials (seller_id);
CREATE INDEX idx_testimonials_published ON public.testimonials (published);
CREATE INDEX idx_testimonials_featured ON public.testimonials (featured);

ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published testimonials are public"
  ON public.testimonials FOR SELECT
  USING (published = true);

CREATE POLICY "Admins can manage all testimonials"
  ON public.testimonials FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_testimonials_updated_at
  BEFORE UPDATE ON public.testimonials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) feedback_display_rules — regras de quando mostrar prompt
CREATE TABLE public.feedback_display_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  module_slug TEXT,
  min_events INT NOT NULL DEFAULT 5,
  min_days_since_first_use INT NOT NULL DEFAULT 7,
  cooldown_days INT NOT NULL DEFAULT 90,
  only_after_paid BOOLEAN NOT NULL DEFAULT false,
  only_after_first_renewal BOOLEAN NOT NULL DEFAULT false,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.feedback_display_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read display rules"
  ON public.feedback_display_rules FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage display rules"
  ON public.feedback_display_rules FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_feedback_display_rules_updated_at
  BEFORE UPDATE ON public.feedback_display_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) user_module_usage — rastreamento de uso por módulo
CREATE TABLE public.user_module_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL,
  user_id UUID NOT NULL,
  module_slug TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  views_count INT NOT NULL DEFAULT 1,
  actions_count INT NOT NULL DEFAULT 0,
  last_action_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, seller_id, module_slug)
);

CREATE INDEX idx_user_module_usage_seller ON public.user_module_usage (seller_id);
CREATE INDEX idx_user_module_usage_user ON public.user_module_usage (user_id);
CREATE INDEX idx_user_module_usage_module ON public.user_module_usage (module_slug);

ALTER TABLE public.user_module_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage"
  ON public.user_module_usage FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own usage"
  ON public.user_module_usage FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own usage"
  ON public.user_module_usage FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all usage"
  ON public.user_module_usage FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_user_module_usage_updated_at
  BEFORE UPDATE ON public.user_module_usage
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6) Função para registrar/incrementar uso de módulo (upsert)
CREATE OR REPLACE FUNCTION public.track_module_usage(
  p_user_id UUID,
  p_seller_id UUID,
  p_module_slug TEXT,
  p_is_action BOOLEAN DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_module_usage (user_id, seller_id, module_slug, views_count, actions_count, last_action_at)
  VALUES (
    p_user_id, p_seller_id, p_module_slug, 1,
    CASE WHEN p_is_action THEN 1 ELSE 0 END,
    CASE WHEN p_is_action THEN now() ELSE NULL END
  )
  ON CONFLICT (user_id, seller_id, module_slug) DO UPDATE SET
    views_count = CASE WHEN NOT p_is_action THEN user_module_usage.views_count + 1 ELSE user_module_usage.views_count END,
    actions_count = CASE WHEN p_is_action THEN user_module_usage.actions_count + 1 ELSE user_module_usage.actions_count END,
    last_seen_at = now(),
    last_action_at = CASE WHEN p_is_action THEN now() ELSE user_module_usage.last_action_at END,
    updated_at = now();
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'track_module_usage failed: %', SQLERRM;
END;
$$;

-- 7) Desativar item "Avaliações" no menu de configurações do seller
UPDATE public.config_menu_items SET active = false WHERE slug = 'avaliacoes';

-- 8) Inserir regras padrão de exibição
INSERT INTO public.feedback_display_rules (kind, module_slug, min_events, min_days_since_first_use, cooldown_days, only_after_paid, enabled)
VALUES 
  ('system', NULL, 10, 14, 180, true, true);
