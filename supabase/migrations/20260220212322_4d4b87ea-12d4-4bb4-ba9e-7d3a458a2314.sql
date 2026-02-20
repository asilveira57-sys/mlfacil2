
-- =====================================================
-- IDENTIDADE VISUAL DINÂMICA POR CATEGORIA ML
-- =====================================================

-- 1. Tabela de configurações de identidade visual por seller
CREATE TABLE public.visual_identity_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL,
  modo_identidade TEXT NOT NULL DEFAULT 'automatico' CHECK (modo_identidade IN ('automatico', 'manual', 'clean')),
  grupo_visual_manual TEXT NULL,
  intensidade_overlay INT NOT NULL DEFAULT 5 CHECK (intensidade_overlay BETWEEN 1 AND 10),
  aplicar_dashboard BOOLEAN NOT NULL DEFAULT true,
  aplicar_menu BOOLEAN NOT NULL DEFAULT false,
  aplicar_cards BOOLEAN NOT NULL DEFAULT false,
  categoria_detectada TEXT NULL,
  grupo_visual_aplicado TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(seller_id)
);

ALTER TABLE public.visual_identity_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own visual identity settings"
  ON public.visual_identity_settings FOR SELECT
  TO authenticated
  USING (seller_id IN (
    SELECT ml_user_id::uuid FROM public.ml_accounts WHERE user_id = auth.uid() AND is_active = true
  ) OR seller_id::text IN (
    SELECT ml_user_id FROM public.ml_accounts WHERE user_id = auth.uid() AND is_active = true
  ) OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users can upsert own visual identity settings"
  ON public.visual_identity_settings FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update own visual identity settings"
  ON public.visual_identity_settings FOR UPDATE
  TO authenticated
  USING (true);

-- 2. Tabela de grupos visuais por categoria
CREATE TABLE public.visual_category_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  imagem_overlay_url TEXT NULL,
  gradiente_inicio TEXT NOT NULL DEFAULT '#1a1a2e',
  gradiente_fim TEXT NOT NULL DEFAULT '#16213e',
  intensidade_padrao INT NOT NULL DEFAULT 4 CHECK (intensidade_padrao BETWEEN 1 AND 10),
  ativo BOOLEAN NOT NULL DEFAULT true,
  prioridade INT NOT NULL DEFAULT 100,
  categorias_ml TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.visual_category_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read visual category groups"
  ON public.visual_category_groups FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage visual category groups"
  ON public.visual_category_groups FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. Tabela de logs de identidade visual
CREATE TABLE public.visual_identity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id TEXT NOT NULL,
  user_id UUID NULL,
  modo_aplicado TEXT NOT NULL,
  categoria_detectada TEXT NULL,
  grupo_visual_aplicado TEXT NULL,
  origem TEXT NOT NULL CHECK (origem IN ('automatico', 'manual', 'clean', 'sazonal', 'sistema')),
  detalhes JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.visual_identity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own visual identity logs"
  ON public.visual_identity_logs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "System can insert visual identity logs"
  ON public.visual_identity_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Triggers para updated_at
CREATE TRIGGER update_visual_identity_settings_updated_at
  BEFORE UPDATE ON public.visual_identity_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_visual_category_groups_updated_at
  BEFORE UPDATE ON public.visual_category_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Índices
CREATE INDEX idx_visual_identity_settings_seller ON public.visual_identity_settings(seller_id);
CREATE INDEX idx_visual_identity_logs_seller ON public.visual_identity_logs(seller_id);
CREATE INDEX idx_visual_identity_logs_created ON public.visual_identity_logs(created_at DESC);
CREATE INDEX idx_visual_category_groups_slug ON public.visual_category_groups(slug);
CREATE INDEX idx_visual_category_groups_ativo ON public.visual_category_groups(ativo, prioridade);

-- Seed de grupos visuais padrão
INSERT INTO public.visual_category_groups (slug, nome, gradiente_inicio, gradiente_fim, intensidade_padrao, prioridade, categorias_ml) VALUES
  ('eletronicos', 'Eletrônicos', '#0f2027', '#2c5364', 5, 10, ARRAY['MLB5672', 'MLB1648', 'MLB1051', 'MLB1000']),
  ('moda', 'Moda e Vestuário', '#2c003e', '#512b58', 4, 20, ARRAY['MLB1430', 'MLB1764']),
  ('casa-decoracao', 'Casa e Decoração', '#1b4332', '#2d6a4f', 4, 30, ARRAY['MLB1574', 'MLB1499']),
  ('esportes', 'Esportes e Fitness', '#0d1b2a', '#1b4965', 5, 40, ARRAY['MLB1276', 'MLB264586']),
  ('automotivo', 'Automotivo', '#1a1a2e', '#3d3d5c', 4, 50, ARRAY['MLB1747', 'MLB1132']),
  ('saude-beleza', 'Saúde e Beleza', '#2d1b36', '#5c3d6e', 4, 60, ARRAY['MLB1246', 'MLB263570']),
  ('brinquedos', 'Brinquedos e Jogos', '#1a1a3e', '#3d3d7c', 5, 70, ARRAY['MLB1132', 'MLB1144']),
  ('alimentos', 'Alimentos e Bebidas', '#2d1b1b', '#5c3d3d', 3, 80, ARRAY['MLB1403', 'MLB1196']),
  ('industria', 'Indústria e Comércio', '#1b1b2d', '#3d3d5c', 3, 90, ARRAY['MLB1500', 'MLB1182']),
  ('generico', 'Geral', '#1a1a2e', '#16213e', 3, 999, ARRAY[]::TEXT[]);

-- Função para registrar log de identidade visual
CREATE OR REPLACE FUNCTION public.log_visual_identity_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.visual_identity_logs (
    seller_id, user_id, modo_aplicado, categoria_detectada, grupo_visual_aplicado, origem, detalhes
  ) VALUES (
    NEW.seller_id::text,
    auth.uid(),
    NEW.modo_identidade,
    NEW.categoria_detectada,
    NEW.grupo_visual_aplicado,
    CASE 
      WHEN NEW.modo_identidade = 'clean' THEN 'clean'
      WHEN NEW.modo_identidade = 'manual' THEN 'manual'
      ELSE 'automatico'
    END,
    jsonb_build_object(
      'intensidade', NEW.intensidade_overlay,
      'aplicar_dashboard', NEW.aplicar_dashboard,
      'aplicar_menu', NEW.aplicar_menu,
      'aplicar_cards', NEW.aplicar_cards,
      'old_modo', OLD.modo_identidade,
      'old_grupo', OLD.grupo_visual_aplicado
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER log_visual_identity_changes
  AFTER UPDATE ON public.visual_identity_settings
  FOR EACH ROW EXECUTE FUNCTION public.log_visual_identity_change();
