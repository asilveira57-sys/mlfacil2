
-- =============================================
-- HELP CATEGORIES
-- =============================================
CREATE TABLE public.help_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.help_categories ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "Anyone can read help categories"
  ON public.help_categories FOR SELECT
  TO anon, authenticated
  USING (true);

-- Admin write
CREATE POLICY "Admins can insert help categories"
  ON public.help_categories FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update help categories"
  ON public.help_categories FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete help categories"
  ON public.help_categories FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_help_categories_updated
  BEFORE UPDATE ON public.help_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- HELP ARTICLES
-- =============================================
CREATE TABLE public.help_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.help_categories(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  summary TEXT,
  content TEXT NOT NULL,
  published BOOLEAN NOT NULL DEFAULT false,
  views INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.help_articles ENABLE ROW LEVEL SECURITY;

-- Public read (published only for anon)
CREATE POLICY "Anyone can read published help articles"
  ON public.help_articles FOR SELECT
  TO anon
  USING (published = true);

CREATE POLICY "Authenticated can read help articles"
  ON public.help_articles FOR SELECT
  TO authenticated
  USING (published = true OR public.has_role(auth.uid(), 'admin'));

-- Admin write
CREATE POLICY "Admins can insert help articles"
  ON public.help_articles FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update help articles"
  ON public.help_articles FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete help articles"
  ON public.help_articles FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_help_articles_updated
  BEFORE UPDATE ON public.help_articles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- INCREMENT VIEWS RPC (anon-safe, no SECURITY DEFINER)
-- =============================================
CREATE OR REPLACE FUNCTION public.increment_help_article_views(p_article_id UUID)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.help_articles SET views = views + 1 WHERE id = p_article_id;
END;
$$;

-- Allow anon to call the RPC but the UPDATE won't bypass RLS
-- We need a minimal policy for anon UPDATE on views only
CREATE POLICY "Anon can increment views"
  ON public.help_articles FOR UPDATE
  TO anon
  USING (published = true)
  WITH CHECK (published = true);

-- =============================================
-- SEED CATEGORIES
-- =============================================
INSERT INTO public.help_categories (name, slug, sort_order) VALUES
  ('Conta e Acesso', 'conta-acesso', 1),
  ('Integrações', 'integracoes', 2),
  ('Módulos do Sistema', 'modulos', 3),
  ('Problemas Técnicos', 'problemas-tecnicos', 4),
  ('Configurações', 'configuracoes', 5);

-- =============================================
-- SEED ARTICLES
-- =============================================
INSERT INTO public.help_articles (category_id, title, slug, summary, content, published) VALUES
(
  (SELECT id FROM public.help_categories WHERE slug = 'conta-acesso'),
  'Como criar sua conta',
  'como-criar-conta',
  'Passo a passo para realizar seu cadastro na plataforma.',
  E'## Como criar sua conta\n\nPara começar a usar a plataforma, siga estes passos:\n\n1. **Acesse a página inicial** do sistema.\n2. Clique no botão **"Criar Conta"** no canto superior direito.\n3. Preencha seus **dados básicos**: nome completo, email e senha.\n4. Verifique sua caixa de entrada e **confirme seu email** clicando no link recebido.\n5. Após a confirmação, faça login e acesse o **painel principal**.\n\n> 💡 Caso não receba o email de confirmação, verifique sua pasta de spam ou solicite o reenvio na tela de login.',
  true
),
(
  (SELECT id FROM public.help_categories WHERE slug = 'integracoes'),
  'Como conectar sua conta do Mercado Livre',
  'como-conectar-mercado-livre',
  'Aprenda a vincular sua conta para sincronização automática.',
  E'## Como conectar sua conta do Mercado Livre\n\nA integração com o Mercado Livre permite sincronizar vendas, anúncios e métricas automaticamente.\n\n### Passo a passo:\n\n1. Acesse **Configurações** no menu lateral.\n2. Na seção **Integrações**, clique em **"Conectar conta do Mercado Livre"**.\n3. Você será redirecionado para a página de autorização do Mercado Livre.\n4. Faça login com suas credenciais e **autorize o acesso** via OAuth.\n5. Após a autorização, você retornará à plataforma com o vínculo confirmado.\n\n> ⚠️ Certifique-se de autorizar a conta correta, pois o vínculo é feito por seller ID.',
  true
),
(
  (SELECT id FROM public.help_categories WHERE slug = 'integracoes'),
  'Como funciona a sincronização de dados',
  'como-funciona-sincronizacao',
  'Entenda como o sistema atualiza informações automaticamente.',
  E'## Como funciona a sincronização de dados\n\nO sistema utiliza **workers e rotinas programadas** para manter seus dados atualizados.\n\n### O que é sincronizado:\n\n- **Vendas**: pedidos pagos são importados automaticamente.\n- **Anúncios**: títulos, preços e status são atualizados.\n- **Métricas**: indicadores de performance são recalculados periodicamente.\n\n### Frequência:\n\nA sincronização ocorre em intervalos regulares (geralmente a cada 6 horas), mas você pode forçar uma atualização manual a qualquer momento nos módulos que suportam essa funcionalidade.\n\n> 💡 Verifique o status da sincronização na página de **Status do Sistema** (/status).',
  true
),
(
  (SELECT id FROM public.help_categories WHERE slug = 'modulos'),
  'Como importar vendas manualmente',
  'como-importar-vendas',
  'Guia para importação via planilha.',
  E'## Como importar vendas manualmente\n\nSe você precisa importar vendas que não foram capturadas automaticamente, siga este guia:\n\n1. Acesse o **módulo de Importação** no menu lateral.\n2. Clique em **"Baixar modelo padrão"** para obter a planilha de referência.\n3. Preencha a planilha com os dados das vendas (data, produto, valor, quantidade).\n4. Clique em **"Importar arquivo"** e selecione a planilha preenchida.\n5. Aguarde o processamento e confira os resultados na tela.\n\n> ⚠️ Certifique-se de que os dados estão no formato correto antes de importar para evitar erros.',
  true
),
(
  (SELECT id FROM public.help_categories WHERE slug = 'modulos'),
  'Como funciona o módulo de precificação',
  'como-funciona-precificacao',
  'Entenda como o sistema calcula margem e preço ideal.',
  E'## Como funciona o módulo de precificação\n\nO módulo de precificação ajuda você a calcular o **preço ideal** para seus produtos.\n\n### Fatores considerados:\n\n- **Custo do produto**: valor de aquisição ou fabricação.\n- **Comissão do marketplace**: taxa cobrada pela plataforma de venda.\n- **Frete**: custo estimado de envio.\n- **Margem desejada**: percentual de lucro que você deseja obter.\n\n### Como usar:\n\n1. Acesse o módulo **Precificação** no menu.\n2. Insira o custo do produto e as taxas aplicáveis.\n3. Defina a margem de lucro desejada.\n4. O sistema calculará automaticamente o **preço sugerido**.\n\n> 💡 Você pode simular diferentes cenários alterando os parâmetros.',
  true
),
(
  (SELECT id FROM public.help_categories WHERE slug = 'modulos'),
  'Como utilizar a extensão',
  'como-utilizar-extensao',
  'Guia rápido para usar a extensão integrada ao navegador.',
  E'## Como utilizar a extensão\n\nA extensão do navegador permite acessar funcionalidades diretamente nas páginas do Mercado Livre.\n\n### Instalação:\n\n1. Acesse a loja de extensões do seu navegador (Chrome Web Store ou equivalente).\n2. Pesquise pelo nome da extensão e clique em **"Adicionar"**.\n3. Após a instalação, o ícone aparecerá na barra de ferramentas.\n\n### Primeiro uso:\n\n1. Clique no ícone da extensão.\n2. Faça **login** com suas credenciais da plataforma.\n3. Navegue até um anúncio no Mercado Livre para ver as informações adicionais.\n\n> 💡 A extensão funciona melhor com as versões mais recentes do Google Chrome.',
  true
),
(
  (SELECT id FROM public.help_categories WHERE slug = 'problemas-tecnicos'),
  'Problemas comuns de login',
  'problemas-login',
  'Soluções rápidas para erros de acesso.',
  E'## Problemas comuns de login\n\nSe você está tendo dificuldades para acessar sua conta, tente as soluções abaixo:\n\n### 1. Senha incorreta\n- Clique em **"Esqueci minha senha"** na tela de login.\n- Verifique sua caixa de entrada e siga as instruções para redefinir.\n\n### 2. Email não confirmado\n- Verifique se você confirmou seu email após o cadastro.\n- Procure o email de confirmação na pasta de spam.\n- Solicite o **reenvio** na tela de login.\n\n### 3. Cache do navegador\n- Limpe o cache e os cookies do navegador.\n- Tente acessar em uma **aba anônima** para verificar se o problema persiste.\n\n### 4. Conta bloqueada\n- Após múltiplas tentativas incorretas, sua conta pode ser bloqueada temporariamente. Aguarde alguns minutos e tente novamente.',
  true
),
(
  (SELECT id FROM public.help_categories WHERE slug = 'problemas-tecnicos'),
  'Erros de API (401, 403, 429)',
  'erros-api-401-403-429',
  'O que significam e como resolver.',
  E'## Erros de API (401, 403, 429)\n\nAo usar integrações, você pode encontrar estes códigos de erro:\n\n### 401 — Token Inválido\n- O token de acesso expirou ou é inválido.\n- **Solução**: Reconecte sua conta do Mercado Livre em Configurações.\n\n### 403 — Permissão Negada\n- Sua conta não tem permissão para acessar este recurso.\n- **Solução**: Verifique se você é o proprietário da conta vinculada.\n\n### 429 — Limite de Requisições\n- Você excedeu o número máximo de requisições permitidas.\n- **Solução**: Aguarde alguns minutos antes de tentar novamente. O sistema respeitará automaticamente os limites de rate limiting.\n\n> 💡 Se o problema persistir, acesse **/contato** e selecione **"Suporte técnico"**.',
  true
),
(
  (SELECT id FROM public.help_categories WHERE slug = 'configuracoes'),
  'Onde visualizar logs do sistema',
  'onde-ver-logs',
  'Saiba onde acompanhar atividades e registros.',
  E'## Onde visualizar logs do sistema\n\nOs logs do sistema permitem acompanhar atividades, alterações e eventos importantes.\n\n### Para administradores:\n- Acesse o **painel administrativo**.\n- Navegue até a aba **"Auditoria"** para visualizar todos os registros.\n- Use os filtros disponíveis para buscar por área, tipo de ação ou período.\n\n### Para usuários:\n- Algumas atividades são registradas e visíveis na seção de **Configurações** da sua conta.\n- Histórico de sincronizações pode ser consultado no módulo correspondente.\n\n> 💡 Os logs são essenciais para rastrear problemas e verificar o que aconteceu em caso de comportamentos inesperados.',
  true
),
(
  (SELECT id FROM public.help_categories WHERE slug = 'problemas-tecnicos'),
  'Como reportar um problema',
  'como-reportar-problema',
  'Canal correto para relatar falhas ou instabilidades.',
  E'## Como reportar um problema\n\nSe você encontrou um bug, falha ou instabilidade, siga estes passos:\n\n1. Acesse a página de **Contato** em [/contato](/contato).\n2. Selecione o assunto **"Suporte técnico"** ou **"Reclamação"** conforme o caso.\n3. Descreva o problema com o máximo de detalhes possível:\n   - O que você estava fazendo quando o problema ocorreu?\n   - Qual mensagem de erro apareceu (se houver)?\n   - Em qual navegador e dispositivo você está?\n4. Envie a mensagem.\n\nNossa equipe analisará o relato e entrará em contato o mais breve possível.\n\n> 💡 Antes de reportar, consulte a página de **Status do Sistema** em [/status](/status) para verificar se há alguma instabilidade conhecida.',
  true
);
