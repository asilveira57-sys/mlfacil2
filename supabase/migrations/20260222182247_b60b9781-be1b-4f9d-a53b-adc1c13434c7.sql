
-- =============================================
-- Tabela: module_explanatory_cards
-- =============================================
CREATE TABLE public.module_explanatory_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_slug TEXT NOT NULL,
  titulo TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('texto','imagem','video','carrossel')),
  conteudo JSONB NOT NULL DEFAULT '{}'::jsonb,
  ordem INT NOT NULL DEFAULT 1,
  ativo BOOLEAN NOT NULL DEFAULT true,
  obrigatorio BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.module_explanatory_cards ENABLE ROW LEVEL SECURITY;

-- Admin pode tudo
CREATE POLICY "Admins manage explanatory cards"
  ON public.module_explanatory_cards FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Todos autenticados podem ler cards ativos
CREATE POLICY "Authenticated users read active cards"
  ON public.module_explanatory_cards FOR SELECT
  TO authenticated
  USING (ativo = true);

CREATE INDEX idx_explanatory_cards_module ON public.module_explanatory_cards(module_slug);
CREATE INDEX idx_explanatory_cards_ativo ON public.module_explanatory_cards(ativo);

CREATE TRIGGER update_explanatory_cards_updated_at
  BEFORE UPDATE ON public.module_explanatory_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- Tabela: user_module_card_views
-- =============================================
CREATE TABLE public.user_module_card_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  module_slug TEXT NOT NULL,
  visualizado BOOLEAN NOT NULL DEFAULT false,
  ip_address TEXT,
  user_agent TEXT,
  visualizado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_module_card_views ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX idx_user_module_card_unique ON public.user_module_card_views(user_id, module_slug);

-- Usuários leem/inserem/atualizam suas próprias views
CREATE POLICY "Users read own card views"
  ON public.user_module_card_views FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own card views"
  ON public.user_module_card_views FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own card views"
  ON public.user_module_card_views FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Admin pode deletar (reset de visualizações)
CREATE POLICY "Admins delete card views"
  ON public.user_module_card_views FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admin pode ler todas as views
CREATE POLICY "Admins read all card views"
  ON public.user_module_card_views FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
