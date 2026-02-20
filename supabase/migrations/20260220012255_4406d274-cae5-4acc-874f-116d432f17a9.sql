
-- ============================================================
-- MÓDULO: MENSAGEM DO DIA
-- ============================================================

-- 1.5 system_settings (config global, somente admin)
CREATE TABLE IF NOT EXISTS public.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read system_settings"
  ON public.system_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage system_settings"
  ON public.system_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 1.1 daily_messages
CREATE TABLE public.daily_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tema TEXT NOT NULL CHECK (tema IN ('empreendedorismo','raul_inspirado','biblica','crista','atitude','geral')),
  texto TEXT NOT NULL,
  referencia TEXT,
  ativa BOOLEAN NOT NULL DEFAULT true,
  ordem_rotacao INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_daily_messages_tema_ativa ON public.daily_messages (tema, ativa);
CREATE INDEX idx_daily_messages_ativa ON public.daily_messages (ativa);
ALTER TABLE public.daily_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read active messages"
  ON public.daily_messages FOR SELECT
  TO authenticated
  USING (ativa = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage messages"
  ON public.daily_messages FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_daily_messages_updated_at
  BEFORE UPDATE ON public.daily_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 1.2 message_daily_log
CREATE TABLE public.message_daily_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  message_id UUID NOT NULL REFERENCES public.daily_messages(id) ON DELETE CASCADE,
  data_exibicao DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, data_exibicao)
);
ALTER TABLE public.message_daily_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own daily log"
  ON public.message_daily_log FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own daily log"
  ON public.message_daily_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 1.3 message_interactions
CREATE TABLE public.message_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  message_id UUID NOT NULL REFERENCES public.daily_messages(id) ON DELETE CASCADE,
  liked BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, message_id)
);
ALTER TABLE public.message_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own interactions"
  ON public.message_interactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own interactions"
  ON public.message_interactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own interactions"
  ON public.message_interactions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy for counting likes (all authenticated can count)
CREATE POLICY "Authenticated can count likes"
  ON public.message_interactions FOR SELECT
  TO authenticated
  USING (true);

-- 1.4 user_message_preferences
CREATE TABLE public.user_message_preferences (
  user_id UUID PRIMARY KEY,
  exibir_mensagem BOOLEAN NOT NULL DEFAULT true,
  tema_preferido TEXT CHECK (tema_preferido IS NULL OR tema_preferido IN ('empreendedorismo','raul_inspirado','biblica','crista','atitude','geral')),
  permitir_gerar_card BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_message_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own preferences"
  ON public.user_message_preferences FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own preferences"
  ON public.user_message_preferences FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON public.user_message_preferences FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_user_message_preferences_updated_at
  BEFORE UPDATE ON public.user_message_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 1.6 message_ai_suggestions
CREATE TABLE public.message_ai_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tema TEXT NOT NULL CHECK (tema IN ('empreendedorismo','raul_inspirado','biblica','crista','atitude','geral')),
  texto TEXT NOT NULL,
  referencia TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovada','reprovada')),
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ
);
ALTER TABLE public.message_ai_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage AI suggestions"
  ON public.message_ai_suggestions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- SEED: system_settings defaults
-- ============================================================
INSERT INTO public.system_settings (key, value) VALUES
  ('mensagem_do_dia_signature', '{"arroba": "@marketplacefacil"}'::jsonb),
  ('mensagem_do_dia_ai_enabled', '{"enabled": true}'::jsonb),
  ('mensagem_do_dia_ai_daily_quota', '{"max_suggestions_per_day": 10}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- SEED: frases iniciais
-- ============================================================
INSERT INTO public.daily_messages (tema, texto, referencia, ativa, ordem_rotacao) VALUES
  ('empreendedorismo', 'Constância faz o que motivação não sustenta.', NULL, true, 1),
  ('empreendedorismo', 'Quem domina os números, domina o jogo.', NULL, true, 2),
  ('empreendedorismo', 'O lucro está nos detalhes que você ignora.', NULL, true, 3),
  ('raul_inspirado', 'Ser livre dá trabalho, mas vale o preço.', 'Inspirado em Raul Seixas', true, 1),
  ('raul_inspirado', 'Prefiro ser essa metamorfose ambulante do que ter aquela velha opinião formada sobre tudo.', 'Inspirado em Raul Seixas', true, 2),
  ('raul_inspirado', 'Sonho que se sonha junto vira realidade no marketplace.', 'Inspirado em Raul Seixas', true, 3),
  ('biblica', 'A paz que você procura também guia seus passos.', 'Inspiração bíblica', true, 1),
  ('biblica', 'Sabedoria vale mais que todo estoque do mundo.', 'Inspiração bíblica', true, 2),
  ('crista', 'Fé não apaga o desafio, fortalece a caminhada.', NULL, true, 1),
  ('crista', 'Trabalhe como se dependesse de você, confie como se dependesse de Deus.', NULL, true, 2),
  ('atitude', 'Decisão simples hoje evita arrependimento amanhã.', NULL, true, 1),
  ('atitude', 'Não espere o momento perfeito. Faça o momento valer.', NULL, true, 2),
  ('atitude', 'Disciplina é a ponte entre metas e conquistas.', NULL, true, 3),
  ('geral', 'Todo grande vendedor começou com o primeiro envio.', NULL, true, 1),
  ('geral', 'Marketplace é maratona, não sprint.', NULL, true, 2);
