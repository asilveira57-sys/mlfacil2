
-- ============================================================
-- MÓDULO AVALIAÇÕES — Migração Completa
-- ============================================================

-- 1) consent_templates (versionamento de textos de consentimento)
CREATE TABLE public.consent_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  published_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(key, version)
);
CREATE INDEX idx_consent_templates_active ON public.consent_templates (is_active);
ALTER TABLE public.consent_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active consent templates" ON public.consent_templates FOR SELECT USING (is_active = true);
CREATE POLICY "Admins manage consent templates" ON public.consent_templates FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Seed: template inicial de depoimento
INSERT INTO public.consent_templates (key, title, body, version, is_active) VALUES
('testimonial_publication_v1', 'Consentimento para Publicação de Depoimento',
 'Ao aceitar, você autoriza o Marketplace Fácil a utilizar seu depoimento, nome, foto e nome da empresa nos canais selecionados (landing page e/ou mídias sociais). Você pode revogar este consentimento a qualquer momento nas Configurações da sua conta.',
 1, true);

-- 2) module_ratings
CREATE TABLE public.module_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES public.system_modules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  stars SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment TEXT,
  is_public BOOLEAN DEFAULT true,
  is_hidden_by_admin BOOLEAN DEFAULT false,
  hidden_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(module_id, user_id)
);
CREATE INDEX idx_module_ratings_module_date ON public.module_ratings (module_id, created_at DESC);
CREATE INDEX idx_module_ratings_user ON public.module_ratings (user_id, created_at DESC);
CREATE INDEX idx_module_ratings_hidden ON public.module_ratings (is_hidden_by_admin);
ALTER TABLE public.module_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read visible module ratings" ON public.module_ratings FOR SELECT USING (is_hidden_by_admin = false OR user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users manage own module ratings" ON public.module_ratings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own module ratings" ON public.module_ratings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own module ratings" ON public.module_ratings FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins manage all module ratings" ON public.module_ratings FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 3) system_ratings
CREATE TABLE public.system_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  stars SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  is_hidden_by_admin BOOLEAN DEFAULT false,
  hidden_reason TEXT
);
CREATE INDEX idx_system_ratings_date ON public.system_ratings (created_at DESC);
CREATE INDEX idx_system_ratings_stars ON public.system_ratings (stars);
ALTER TABLE public.system_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read visible system ratings" ON public.system_ratings FOR SELECT USING (is_hidden_by_admin = false OR user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users manage own system rating" ON public.system_ratings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own system rating" ON public.system_ratings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own system rating" ON public.system_ratings FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins manage all system ratings" ON public.system_ratings FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 4) seller_public_profile_settings
CREATE TABLE public.seller_public_profile_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  display_name TEXT,
  display_company TEXT,
  show_photo BOOLEAN DEFAULT true,
  show_name BOOLEAN DEFAULT true,
  show_company BOOLEAN DEFAULT true,
  photo_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.seller_public_profile_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own public profile" ON public.seller_public_profile_settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins read all public profiles" ON public.seller_public_profile_settings FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- 5) rating_consents (consentimentos de depoimento, separado da tabela de cookies/LGPD existente)
CREATE TABLE public.rating_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  template_id UUID NOT NULL REFERENCES public.consent_templates(id),
  consent_key TEXT NOT NULL,
  consent_version INT NOT NULL,
  accepted BOOLEAN NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  source TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_rating_consents_user ON public.rating_consents (user_id, accepted_at DESC);
CREATE INDEX idx_rating_consents_key ON public.rating_consents (consent_key, consent_version);
CREATE INDEX idx_rating_consents_accepted ON public.rating_consents (accepted);
ALTER TABLE public.rating_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own consents" ON public.rating_consents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own consents" ON public.rating_consents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins read all consents" ON public.rating_consents FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- 6) testimonial_candidates
CREATE TABLE public.testimonial_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('system_rating', 'module_rating')),
  source_id UUID NOT NULL,
  stars SMALLINT NOT NULL,
  text TEXT,
  suggested_channels TEXT[] NOT NULL DEFAULT '{landing,social}',
  consent_id UUID REFERENCES public.rating_consents(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'published', 'archived')),
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_testimonial_candidates_status ON public.testimonial_candidates (status, created_at DESC);
CREATE INDEX idx_testimonial_candidates_stars ON public.testimonial_candidates (stars);
CREATE INDEX idx_testimonial_candidates_user ON public.testimonial_candidates (user_id, created_at DESC);
ALTER TABLE public.testimonial_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own candidates" ON public.testimonial_candidates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins manage all candidates" ON public.testimonial_candidates FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 7) public_testimonials
CREATE TABLE public.public_testimonials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL UNIQUE REFERENCES public.testimonial_candidates(id),
  user_id UUID NOT NULL,
  stars SMALLINT NOT NULL,
  text TEXT NOT NULL,
  display_name TEXT,
  display_company TEXT,
  photo_url TEXT,
  channels TEXT[] NOT NULL DEFAULT '{landing,social}',
  is_active BOOLEAN DEFAULT true,
  published_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_public_testimonials_active ON public.public_testimonials (is_active, published_at DESC);
CREATE INDEX idx_public_testimonials_channels ON public.public_testimonials USING GIN (channels);
ALTER TABLE public.public_testimonials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads active public testimonials" ON public.public_testimonials FOR SELECT USING (is_active = true);
CREATE POLICY "Admins manage all testimonials" ON public.public_testimonials FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 8) module_rating_stats
CREATE TABLE public.module_rating_stats (
  module_id UUID PRIMARY KEY REFERENCES public.system_modules(id) ON DELETE CASCADE,
  avg_stars NUMERIC(3,2) DEFAULT 0,
  ratings_count INT DEFAULT 0,
  stars_1 INT DEFAULT 0,
  stars_2 INT DEFAULT 0,
  stars_3 INT DEFAULT 0,
  stars_4 INT DEFAULT 0,
  stars_5 INT DEFAULT 0,
  last_rating_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.module_rating_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads module rating stats" ON public.module_rating_stats FOR SELECT USING (true);
CREATE POLICY "System updates stats" ON public.module_rating_stats FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 9) system_rating_stats (single row)
CREATE TABLE public.system_rating_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  avg_stars NUMERIC(3,2) DEFAULT 0,
  ratings_count INT DEFAULT 0,
  stars_1 INT DEFAULT 0,
  stars_2 INT DEFAULT 0,
  stars_3 INT DEFAULT 0,
  stars_4 INT DEFAULT 0,
  stars_5 INT DEFAULT 0,
  last_rating_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);
INSERT INTO public.system_rating_stats (id) VALUES (gen_random_uuid());
ALTER TABLE public.system_rating_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads system rating stats" ON public.system_rating_stats FOR SELECT USING (true);
CREATE POLICY "System updates stats" ON public.system_rating_stats FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 10) Trigger functions for stats recalculation

-- Module ratings stats recalc
CREATE OR REPLACE FUNCTION public.recalc_module_rating_stats()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_module_id UUID;
BEGIN
  v_module_id := COALESCE(NEW.module_id, OLD.module_id);
  INSERT INTO public.module_rating_stats (module_id, avg_stars, ratings_count, stars_1, stars_2, stars_3, stars_4, stars_5, last_rating_at, updated_at)
  SELECT
    v_module_id,
    COALESCE(AVG(stars), 0),
    COUNT(*),
    COUNT(*) FILTER (WHERE stars = 1),
    COUNT(*) FILTER (WHERE stars = 2),
    COUNT(*) FILTER (WHERE stars = 3),
    COUNT(*) FILTER (WHERE stars = 4),
    COUNT(*) FILTER (WHERE stars = 5),
    MAX(created_at),
    now()
  FROM public.module_ratings
  WHERE module_id = v_module_id AND is_hidden_by_admin = false
  ON CONFLICT (module_id) DO UPDATE SET
    avg_stars = EXCLUDED.avg_stars,
    ratings_count = EXCLUDED.ratings_count,
    stars_1 = EXCLUDED.stars_1,
    stars_2 = EXCLUDED.stars_2,
    stars_3 = EXCLUDED.stars_3,
    stars_4 = EXCLUDED.stars_4,
    stars_5 = EXCLUDED.stars_5,
    last_rating_at = EXCLUDED.last_rating_at,
    updated_at = now();
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_recalc_module_rating_stats
AFTER INSERT OR UPDATE OR DELETE ON public.module_ratings
FOR EACH ROW EXECUTE FUNCTION public.recalc_module_rating_stats();

-- System ratings stats recalc
CREATE OR REPLACE FUNCTION public.recalc_system_rating_stats()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.system_rating_stats SET
    avg_stars = COALESCE((SELECT AVG(stars) FROM public.system_ratings WHERE is_hidden_by_admin = false), 0),
    ratings_count = (SELECT COUNT(*) FROM public.system_ratings WHERE is_hidden_by_admin = false),
    stars_1 = (SELECT COUNT(*) FROM public.system_ratings WHERE is_hidden_by_admin = false AND stars = 1),
    stars_2 = (SELECT COUNT(*) FROM public.system_ratings WHERE is_hidden_by_admin = false AND stars = 2),
    stars_3 = (SELECT COUNT(*) FROM public.system_ratings WHERE is_hidden_by_admin = false AND stars = 3),
    stars_4 = (SELECT COUNT(*) FROM public.system_ratings WHERE is_hidden_by_admin = false AND stars = 4),
    stars_5 = (SELECT COUNT(*) FROM public.system_ratings WHERE is_hidden_by_admin = false AND stars = 5),
    last_rating_at = (SELECT MAX(created_at) FROM public.system_ratings WHERE is_hidden_by_admin = false),
    updated_at = now();
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_recalc_system_rating_stats
AFTER INSERT OR UPDATE OR DELETE ON public.system_ratings
FOR EACH ROW EXECUTE FUNCTION public.recalc_system_rating_stats();

-- 11) updated_at triggers
CREATE TRIGGER set_module_ratings_updated_at BEFORE UPDATE ON public.module_ratings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_system_ratings_updated_at BEFORE UPDATE ON public.system_ratings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_seller_public_profile_updated_at BEFORE UPDATE ON public.seller_public_profile_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_testimonial_candidates_updated_at BEFORE UPDATE ON public.testimonial_candidates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
