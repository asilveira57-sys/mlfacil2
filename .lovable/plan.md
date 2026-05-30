# Blog Pro + Assistente de SEO com IA

Transformar o blog atual em uma ferramenta completa de publicação, no estilo WordPress, com editor visual, upload de imagens, embed de vídeo e assistente de IA para SEO.

## 1. Backend (Lovable Cloud)

### Banco de dados (migration)
Adicionar colunas em `blog_posts`:
- `imagem_capa_alt` (text) — obrigatório quando há capa
- `tempo_leitura_min` (int) — auto-calculado a partir do conteúdo
- `seo_score` (int 0–100) — preenchido pelo auditor de IA
- `meta_title` e `meta_description` (caso ainda não existam) — usados nas tags `<title>` e `<meta>`

### Storage
- Criar bucket público `blog-media`
- Políticas: `SELECT` público; `INSERT/UPDATE/DELETE` apenas para autenticados

### Edge Function `blog-ai-assistant`
Usa Lovable AI Gateway (modelo `google/gemini-2.5-flash`, sem custo extra). 4 ações:
- `generate_meta` → title ≤60, description ≤160, 8–12 keywords
- `improve_content` → corrige gramática, sugere H2/H3
- `generate_alt` → alt ≤125 caracteres a partir da URL/contexto da imagem
- `seo_audit` → score 0–100 + lista de problemas e sugestões

Logs salvos em `system_logs` (area `blog_ai`).

## 2. Frontend — Editor

### Novo componente `RichTextEditor.tsx`
Baseado em TipTap (`@tiptap/react` + `starter-kit` + extensões para imagem, YouTube e paste-cleanup do Word/Docs/WordPress).

Recursos:
- Toolbar com H1/H2/H3, negrito, itálico, listas, link, citação, código
- Upload de imagem direto (drag, paste ou botão) → envia ao bucket `blog-media`
- Inserir imagem por URL com campo de **alt obrigatório**
- Embed de YouTube/Vimeo via URL
- Colar conteúdo do Word/Google Docs/WordPress com limpeza automática
- Saída: HTML salvo em `conteudo_principal`

### `BlogPostEditor.tsx` reformulado
- Substitui o textarea pelo `RichTextEditor`
- Botão **"Auto-SEO ✨"** → preenche meta title, description e keywords
- Botão **"Gerar alt com IA"** ao lado do campo da capa
- Botão **"Revisar conteúdo com IA"** → aplica `improve_content`
- Painel **"Auditoria de SEO"** com score visual, problemas e sugestões
- Pré-visualização ao vivo, contagem de palavras e tempo de leitura
- Slug gerado automaticamente a partir do título (editável)

## 3. Frontend — Renderização pública

### `Blog.tsx` (lista) e página de post individual
- Renderização com `dangerouslySetInnerHTML` sanitizada via `DOMPurify`
- Classes `prose prose-lg` do `@tailwindcss/typography` para HTML bonito
- Cards com `aspect-video`, lazy loading de imagens, miniatura destacada
- Por post via `react-helmet-async`:
  - `<title>` e `<meta name="description">` específicos
  - `<link rel="canonical">` apontando para o slug
  - Open Graph (`og:title`, `og:description`, `og:image`, `og:type=article`)
  - **JSON-LD `Article`** com `headline`, `image`, `datePublished`, `author`

### `index.html`
- Remover `<link rel="canonical">` global (cada rota define o seu via Helmet)
- Manter Organization JSON-LD e meta padrão como fallback

## 4. Dependências novas
- `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-image`, `@tiptap/extension-youtube`
- `dompurify` + `@types/dompurify`
- `@tailwindcss/typography`
- `react-helmet-async`

## Fora de escopo
- `BlogArticleGenerator` (geração de artigo inteiro por IA) — permanece como está
- Mudanças no admin de comentários/categorias

## Detalhes técnicos
- `conteudo_principal` passa a armazenar **HTML** (TipTap salva HTML nativo). Como ainda não há posts publicados, não há migração de dados.
- Sanitização sempre via `DOMPurify` antes de renderizar (allowlist incluindo `iframe` apenas para YouTube/Vimeo).
- IA estritamente server-side: o frontend chama a edge function, nunca o gateway direto.
- Edge function valida sessão autenticada (admin) antes de processar ações.
