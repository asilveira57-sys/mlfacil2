
-- ============================================================
-- MÓDULO: CALENDÁRIO DE REDE SOCIAL
-- ============================================================

-- 1. Tabela de eventos do calendário
CREATE TABLE IF NOT EXISTS public.social_calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'manual',       -- 'un', 'holiday_api', 'manual'
  country_code text,                            -- null = global
  event_date date NOT NULL,
  title text NOT NULL,
  description text,
  tags jsonb DEFAULT '[]'::jsonb,
  category text NOT NULL DEFAULT 'tematica',   -- 'tematica', 'feriado', 'comercial', 'sazonal'
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_calendar_events_date ON public.social_calendar_events(event_date);
CREATE INDEX IF NOT EXISTS idx_social_calendar_events_country ON public.social_calendar_events(country_code);
CREATE INDEX IF NOT EXISTS idx_social_calendar_events_source ON public.social_calendar_events(source);
CREATE INDEX IF NOT EXISTS idx_social_calendar_events_category ON public.social_calendar_events(category);
CREATE INDEX IF NOT EXISTS idx_social_calendar_events_active ON public.social_calendar_events(is_active);
CREATE INDEX IF NOT EXISTS idx_social_calendar_events_date_country ON public.social_calendar_events(event_date, country_code, is_active);

-- 2. Tabela de templates de sugestão
CREATE TABLE IF NOT EXISTS public.social_calendar_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  niche text NOT NULL DEFAULT 'geral',         -- 'beleza', 'autopeças', 'pet', 'papelaria', 'eletrônicos', 'moda', 'geral'
  format text NOT NULL DEFAULT 'feed',         -- 'reels', 'stories', 'feed', 'carrossel', 'shorts'
  hook text NOT NULL,
  script text NOT NULL,
  cta text,
  tags jsonb DEFAULT '[]'::jsonb,
  event_category text,                         -- vinculação com categoria do evento
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_calendar_templates_niche ON public.social_calendar_templates(niche);
CREATE INDEX IF NOT EXISTS idx_social_calendar_templates_format ON public.social_calendar_templates(format);
CREATE INDEX IF NOT EXISTS idx_social_calendar_templates_active ON public.social_calendar_templates(is_active);

-- 3. Preferências do usuário
CREATE TABLE IF NOT EXISTS public.social_calendar_user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  seller_id text,
  country_code text NOT NULL DEFAULT 'BR',
  selected_niches jsonb DEFAULT '["geral"]'::jsonb,
  preferred_formats jsonb DEFAULT '["feed", "stories"]'::jsonb,
  objective text DEFAULT 'engajamento',        -- 'engajamento', 'tráfego', 'conversão', 'marca'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_social_calendar_prefs_user ON public.social_calendar_user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_social_calendar_prefs_seller ON public.social_calendar_user_preferences(seller_id);

-- 4. Pautas salvas pelo usuário
CREATE TABLE IF NOT EXISTS public.social_calendar_saved_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  seller_id text,
  event_id uuid REFERENCES public.social_calendar_events(id) ON DELETE SET NULL,
  chosen_template_id uuid REFERENCES public.social_calendar_templates(id) ON DELETE SET NULL,
  custom_notes text,
  custom_title text,
  status text NOT NULL DEFAULT 'backlog',      -- 'backlog', 'produzindo', 'postado'
  planned_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_calendar_saved_user ON public.social_calendar_saved_ideas(user_id);
CREATE INDEX IF NOT EXISTS idx_social_calendar_saved_seller ON public.social_calendar_saved_ideas(seller_id);
CREATE INDEX IF NOT EXISTS idx_social_calendar_saved_status ON public.social_calendar_saved_ideas(status);
CREATE INDEX IF NOT EXISTS idx_social_calendar_saved_date ON public.social_calendar_saved_ideas(planned_date);
CREATE INDEX IF NOT EXISTS idx_social_calendar_saved_event ON public.social_calendar_saved_ideas(event_id);

-- 5. Telemetria/engajamento do módulo
CREATE TABLE IF NOT EXISTS public.social_calendar_engagement_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  seller_id text,
  event_type text NOT NULL,   -- 'view', 'click', 'save', 'export', 'share', 'generate', 'error'
  event_id uuid,              -- referência ao social_calendar_events
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_cal_engagement_user ON public.social_calendar_engagement_events(user_id);
CREATE INDEX IF NOT EXISTS idx_social_cal_engagement_type ON public.social_calendar_engagement_events(event_type);
CREATE INDEX IF NOT EXISTS idx_social_cal_engagement_date ON public.social_calendar_engagement_events(created_at);

-- 6. Triggers updated_at
CREATE TRIGGER update_social_calendar_events_updated_at
  BEFORE UPDATE ON public.social_calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_social_calendar_templates_updated_at
  BEFORE UPDATE ON public.social_calendar_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_social_calendar_prefs_updated_at
  BEFORE UPDATE ON public.social_calendar_user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_social_calendar_saved_updated_at
  BEFORE UPDATE ON public.social_calendar_saved_ideas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- RLS POLICIES
-- ============================================================

ALTER TABLE public.social_calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_calendar_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_calendar_user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_calendar_saved_ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_calendar_engagement_events ENABLE ROW LEVEL SECURITY;

-- Events: todos os usuários autenticados podem ler eventos ativos; apenas admins escrevem
CREATE POLICY "social_calendar_events_select" ON public.social_calendar_events
  FOR SELECT USING (is_active = true);

CREATE POLICY "social_calendar_events_admin_all" ON public.social_calendar_events
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Templates: todos leem ativos; apenas admins escrevem
CREATE POLICY "social_calendar_templates_select" ON public.social_calendar_templates
  FOR SELECT USING (is_active = true);

CREATE POLICY "social_calendar_templates_admin_all" ON public.social_calendar_templates
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- User preferences: cada usuário gerencia as suas
CREATE POLICY "social_calendar_prefs_select" ON public.social_calendar_user_preferences
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "social_calendar_prefs_insert" ON public.social_calendar_user_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "social_calendar_prefs_update" ON public.social_calendar_user_preferences
  FOR UPDATE USING (user_id = auth.uid());

-- Saved ideas: cada usuário gerencia as suas
CREATE POLICY "social_calendar_saved_select" ON public.social_calendar_saved_ideas
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "social_calendar_saved_insert" ON public.social_calendar_saved_ideas
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "social_calendar_saved_update" ON public.social_calendar_saved_ideas
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "social_calendar_saved_delete" ON public.social_calendar_saved_ideas
  FOR DELETE USING (user_id = auth.uid());

-- Admins podem ver todas as pautas salvas (para métricas)
CREATE POLICY "social_calendar_saved_admin" ON public.social_calendar_saved_ideas
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Engagement events: usuário insere os seus; admin lê todos
CREATE POLICY "social_cal_engagement_insert" ON public.social_calendar_engagement_events
  FOR INSERT WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "social_cal_engagement_select_own" ON public.social_calendar_engagement_events
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "social_cal_engagement_admin" ON public.social_calendar_engagement_events
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- SEED: Templates iniciais de sugestão
-- ============================================================
INSERT INTO public.social_calendar_templates (niche, format, hook, script, cta, tags, event_category) VALUES
  ('geral', 'feed', '📅 Hoje é {{evento}}! Já sabia?', 'Hoje celebramos {{evento}}. Uma ótima oportunidade para refletir sobre {{tema}} e compartilhar com quem você ama. ❤️ Aproveite a data para {{acao}}.', 'Salve esse post para lembrar! 💾', '["data-comemorativa", "engajamento"]'::jsonb, 'tematica'),
  ('geral', 'stories', '{{evento}} ✨ Arrasta pra ver!', 'Você sabia que hoje é {{evento}}? Desliza para descobrir como aproveitar essa data nas suas vendas! 🚀', 'Toca no link da bio 👆', '["stories", "data"]'::jsonb, 'tematica'),
  ('geral', 'reels', '🎬 {{evento}} em 30 segundos!', 'Vamos falar sobre {{evento}}! Esse é o momento perfeito para {{acao}}. Assiste até o final! 👇', 'Comenta aqui o que achou! 💬', '["reels", "engajamento"]'::jsonb, 'tematica'),
  ('geral', 'carrossel', '{{evento}} — o guia completo! 📖', 'Slide 1: O que é {{evento}}? Slide 2: Por que isso importa para você? Slide 3: Como aproveitar? Slide 4: Dica bônus! 🎁', 'Salva e compartilha! 🔁', '["carrossel", "educativo"]'::jsonb, 'tematica'),
  ('pet', 'feed', '🐾 {{evento}} chegou! E seu pet?', 'Nessa data especial, não esquece do seu melhor amigo! Produtos incríveis para cuidar, mimar e celebrar com ele. 🐶🐱', 'Clica no link e confere! 🛒', '["pet", "feriado"]'::jsonb, 'feriado'),
  ('beleza', 'reels', '💄 {{evento}}: tendências que você precisa ver!', 'Chegou {{evento}} e nós temos as últimas tendências em beleza. Não fica de fora! Olha o que preparamos pra você... ✨', 'Vai nos stories ver mais! 👆', '["beleza", "moda", "tendencia"]'::jsonb, 'comercial'),
  ('autopeças', 'feed', '🔧 {{evento}} com desconto especial!', 'Não deixa seu carro na mão! Aproveite {{evento}} para revisar, trocar e garantir o melhor desempenho. Peças selecionadas com oferta exclusiva! 🚗', 'Acesse nossa loja! 🏪', '["autopeças", "promo"]'::jsonb, 'comercial'),
  ('papelaria', 'carrossel', '📝 {{evento}}: organize sua vida com estilo!', 'Seja na escola, no trabalho ou em casa — a papelaria certa faz toda a diferença. Confira nossa coleção especial para {{evento}}! 🎨', 'Link na bio! Aproveite 🎉', '["papelaria", "organização"]'::jsonb, 'sazonal'),
  ('eletrônicos', 'feed', '⚡ {{evento}}: tech com preço imbatível!', 'A data chegou e com ela as melhores ofertas em eletrônicos! Tablets, fones, carregadores e muito mais. Não perde! 🔌', 'Compra agora! 👇', '["eletrônico", "tech", "oferta"]'::jsonb, 'comercial'),
  ('moda', 'stories', '👗 {{evento}} — seu look especial te espera!', 'Cada data merece um look especial. Desliza e encontre o outfit perfeito para {{evento}}! 💃', 'Compra pelo link da bio 🔗', '["moda", "look", "estilo"]'::jsonb, 'sazonal')
ON CONFLICT DO NOTHING;
