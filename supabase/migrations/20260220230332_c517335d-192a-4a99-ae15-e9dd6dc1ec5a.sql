-- ================================================================
-- MÓDULO DICA DE CONSULTOR 2.0
-- ================================================================

-- 1. TABELA PRINCIPAL: consultant_tips
CREATE TABLE IF NOT EXISTS public.consultant_tips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  slug text UNIQUE NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('texto','imagem','video','carrossel')),
  conteudo_json jsonb NOT NULL DEFAULT '{}',
  categoria text,
  modulo_relacionado text NULL,
  tags text[] NULL,
  nivel text CHECK (nivel IN ('iniciante','intermediario','avancado')) DEFAULT 'iniciante',
  fixada_dashboard boolean DEFAULT false,
  ativa boolean DEFAULT true,
  versao integer DEFAULT 1,
  created_by uuid NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consultant_tips_modulo ON public.consultant_tips(modulo_relacionado);
CREATE INDEX IF NOT EXISTS idx_consultant_tips_categoria ON public.consultant_tips(categoria);
CREATE INDEX IF NOT EXISTS idx_consultant_tips_tags ON public.consultant_tips USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_consultant_tips_ativa ON public.consultant_tips(ativa);
CREATE INDEX IF NOT EXISTS idx_consultant_tips_fixada ON public.consultant_tips(fixada_dashboard) WHERE fixada_dashboard = true;

-- 2. TABELA: consultant_tip_views (sem limite de registros)
CREATE TABLE IF NOT EXISTS public.consultant_tip_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tip_id uuid NOT NULL REFERENCES public.consultant_tips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  viewed_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tip_views_tip_id ON public.consultant_tip_views(tip_id);
CREATE INDEX IF NOT EXISTS idx_tip_views_user_id ON public.consultant_tip_views(user_id);
CREATE INDEX IF NOT EXISTS idx_tip_views_user_tip ON public.consultant_tip_views(user_id, tip_id);

-- 3. TABELA: consultant_tip_interactions (sem limite de registros)
CREATE TABLE IF NOT EXISTS public.consultant_tip_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tip_id uuid NOT NULL REFERENCES public.consultant_tips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  tipo_interacao text NOT NULL CHECK (tipo_interacao IN ('like','salvar','compartilhar')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tip_interactions_tip_id ON public.consultant_tip_interactions(tip_id);
CREATE INDEX IF NOT EXISTS idx_tip_interactions_user_id ON public.consultant_tip_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_tip_interactions_tipo ON public.consultant_tip_interactions(tipo_interacao);
CREATE INDEX IF NOT EXISTS idx_tip_interactions_user_tip_tipo ON public.consultant_tip_interactions(user_id, tip_id, tipo_interacao);

-- 4. TRIGGER: updated_at automático
CREATE OR REPLACE FUNCTION public.update_consultant_tips_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_consultant_tips_updated_at
  BEFORE UPDATE ON public.consultant_tips
  FOR EACH ROW EXECUTE FUNCTION public.update_consultant_tips_updated_at();

-- 5. RLS: consultant_tips (todos leem dicas ativas, admin gerencia)
ALTER TABLE public.consultant_tips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos podem ler dicas ativas"
  ON public.consultant_tips FOR SELECT
  USING (ativa = true);

CREATE POLICY "Admin pode gerenciar todas as dicas"
  ON public.consultant_tips FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 6. RLS: consultant_tip_views
ALTER TABLE public.consultant_tip_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários registram e veem suas visualizações"
  ON public.consultant_tip_views FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admin vê todas as visualizações"
  ON public.consultant_tip_views FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- 7. RLS: consultant_tip_interactions
ALTER TABLE public.consultant_tip_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários gerenciam suas interações"
  ON public.consultant_tip_interactions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admin vê todas as interações"
  ON public.consultant_tip_interactions FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- 8. DADOS INICIAIS: algumas dicas de exemplo
INSERT INTO public.consultant_tips (titulo, slug, tipo, conteudo_json, categoria, modulo_relacionado, tags, nivel, fixada_dashboard, ativa)
VALUES
  (
    'Como calcular o preço de venda ideal no Mercado Livre',
    'calcular-preco-venda-ideal',
    'texto',
    '{"body": "Para calcular o preço de venda ideal, considere: custo do produto + frete + taxa ML (11-17%) + impostos + margem de lucro desejada. Use a fórmula: Preço = Custo / (1 - % total de deduções). Uma margem de 20-30% é recomendada para produtos competitivos.", "highlights": ["Sempre inclua o custo de embalagem", "Considere o frete grátis obrigatório acima de R$79", "Monitore o preço dos concorrentes semanalmente"]}',
    'Precificação',
    'precificacao',
    ARRAY['precificacao','margem','taxa-ml','preco'],
    'iniciante',
    true,
    true
  ),
  (
    'Radiografia de anúncio: o que analisar primeiro',
    'radiografia-anuncio-analise-prioritaria',
    'texto',
    '{"body": "Ao analisar um anúncio com queda de vendas, priorize: 1) Taxa de conversão (abaixo de 1% é crítico), 2) Posição no ranking (acima de 5ª página = invisível), 3) Qualidade do anúncio (título, fotos, descrição), 4) Preço vs concorrentes, 5) Reputação do vendedor.", "highlights": ["Taxa de conversão saudável: 2-5%", "Fotos profissionais aumentam conversão em até 35%", "Títulos com palavras-chave relevantes melhoram o SEO interno do ML"]}',
    'Análise',
    'radiografia',
    ARRAY['radiografia','conversao','ranking','analise'],
    'intermediario',
    false,
    true
  ),
  (
    'ABC Curve: como usar para priorizar seu estoque',
    'abc-curve-priorizar-estoque',
    'texto',
    '{"body": "A Curva ABC divide seus produtos em 3 grupos: A (20% dos produtos = 80% do faturamento), B (30% dos produtos = 15% do faturamento), C (50% dos produtos = 5% do faturamento). Estratégia: produtos A merecem atenção máxima em estoque e preço, produtos C podem ser descontinuados.", "highlights": ["Nunca fique sem estoque de produtos A", "Produtos B são candidatos a promoções pontuais", "Produtos C consomem capital de giro sem retorno proporcional"]}',
    'Gestão',
    'abc_analysis',
    ARRAY['abc','estoque','curva-abc','gestao'],
    'intermediario',
    false,
    true
  )
ON CONFLICT (slug) DO NOTHING;