

# Plano: Reformulacao Completa do Front-End da Landing Page

## Visao Geral

Este plano aborda 6 grandes frentes de trabalho para preparar a landing page para comercializacao. Dado o volume de alteracoes, recomendo dividir a execucao em **4 fases sequenciais** para manter a estabilidade.

---

## Fase 1 - Atualizar Modulos e Remover "Notas Fiscais"

### 1.1 Reescrever a secao de Modulos (LandingModules)

A secao atual tem 6 cards genericos que nao refletem o sistema real. Substituir por modulos que representam o que o sistema realmente faz:

| Card Atual | Novo Card | Icone | Rota da pagina de detalhe |
|---|---|---|---|
| Gestao de Anuncios | **Gestao de Anuncios** (manter, atualizar texto) | ClipboardList | /modulo/gestao-anuncios |
| Analise de Vendas | **Dashboard e Analises** | BarChart3 | /modulo/dashboard-analises |
| Gestao de Clientes | **Precificacao e Custos** | Calculator | /modulo/precificacao-custos |
| Controle de Qualidade | **Radiografia e Seed** | Activity | /modulo/radiografia-seed |
| Calculadora de Custos | **Tendencias e Concorrencia** | TrendingUp | /modulo/tendencias-concorrencia |
| Relatorios Fiscais | **Automacoes e Alertas** | Zap | /modulo/automacoes-alertas |

Cada card tera:
- Titulo e descricao atualizados (nos 3 idiomas)
- Link "Ver mais" apontando para pagina de detalhe propria (Fase 3)
- Texto do link "Ver mais" internacionalizado (hoje esta hardcoded em portugues no `FeatureCard`)

### 1.2 Remover "Notas Fiscais" da secao Integracoes

No `LandingIntegrations.tsx`, remover o item2 (Notas Fiscais) e substituir por algo que o sistema realmente faz. Sugestao: **Relatorios e Exportacao** ou **API do Mercado Livre**.

Atualizar `landing.json` nos 3 idiomas (pt-BR, en, es) + `siteDefaultTexts.ts`.

### 1.3 Atualizar secao de Beneficios

Os 6 beneficios atuais estao razoaveis, mas podem ser refinados para refletir melhor os 17 modulos do sistema. Atualizar textos nos 3 idiomas.

---

## Fase 2 - Menu Header + Pagina de Consultoria

### 2.1 Adicionar "Consultoria" ao menu do header

No `LandingHeader.tsx`, adicionar novo item de navegacao:

```text
Recursos | Ferramentas | Como funciona | Integracoes | Planos | Consultoria (NOVO) | Blog | Suporte
```

O item "Consultoria" aponta para a rota `/consultoria`.

### 2.2 Criar pagina de Consultoria (`/consultoria`)

Nova pagina publica (fora do shell) com:
- Apresentacao dos servicos de consultoria
- Cards com pacotes/servicos e valores
- Integracao com Mercado Pago para pagamento (botao de checkout)
- Secao de depoimentos/cases
- FAQ sobre consultoria
- i18n completa (pt-BR, en, es)

Arquivos:
- `src/pages/Consultoria.tsx` - pagina principal
- `src/locales/*/consultoria.json` - traducoes nos 3 idiomas
- Registro no `src/lib/i18n/index.ts` (novo namespace `consultoria`)
- Rota no `App.tsx` como rota publica

A integracao com Mercado Pago sera preparada com botoes de CTA que redirecionam para um link de pagamento (pode ser um link do Mercado Pago ou WhatsApp inicialmente, com checkout integrado numa segunda iteracao).

### 2.3 Atualizar locales do header

Adicionar chave `menu_consultoria` nos 3 idiomas:
- pt-BR: "Consultoria"
- en: "Consulting"
- es: "Consultoría"

Atualizar tambem o footer para incluir link de Consultoria.

---

## Fase 3 - Paginas de Detalhe por Modulo (SEO)

### 3.1 Criar pagina template de detalhe de modulo

Uma unica pagina componente (`src/pages/ModuloDetalhe.tsx`) que recebe o slug do modulo via rota (`/modulo/:slug`) e renderiza conteudo especifico:

- Hero com titulo e descricao do modulo
- Lista de funcionalidades detalhadas
- Screenshots/mockups (via `EditableImage`)
- CTA para criar conta
- FAQ especifico do modulo
- SEO completo (meta title, description, keywords, OG tags)

### 3.2 Estrutura de dados dos modulos

Criar um arquivo `src/content/modulePages.ts` com os dados de cada modulo:

```text
slug: "gestao-anuncios"
  -> titulo, descricao, funcionalidades[], icone
  -> meta_title, meta_description, meta_keywords
  -> CTA text

slug: "dashboard-analises"
  -> ...

slug: "precificacao-custos"
  -> ...

(etc para todos os modulos)
```

Cada modulo tera seu conteudo nos 3 idiomas no namespace `landing.json` (ou novo namespace `modules.json`).

### 3.3 Rotas

No `App.tsx`, adicionar rota publica:
```text
/modulo/:slug -> ModuloDetalhe
```

### 3.4 Integracao com Admin SEO

Ao criar cada pagina de modulo, inserir registro correspondente na tabela `seo_page_settings` via migracao SQL:

```text
INSERT INTO seo_page_settings (page_path, page_type, meta_title, meta_description, meta_keywords, robots_index, robots_follow) VALUES
  ('/modulo/gestao-anuncios', 'external_page', 'Gestao de Anuncios - ML Facil', 'Controle completo dos seus anuncios...', 'gestao anuncios mercado livre, gerenciar anuncios ml', true, true),
  ('/modulo/dashboard-analises', 'external_page', 'Dashboard e Analises - ML Facil', '...', '...', true, true),
  ...
```

O hook `useSeoMeta` ja existente vai aplicar automaticamente os meta tags ao navegar para essas paginas. E no Admin SEO (`/admin/seo`) o admin podera editar titulo, descricao e keywords de cada pagina de modulo.

### 3.5 Atualizar FeatureCard

O componente `FeatureCard.tsx` tem "Ver mais" hardcoded em portugues. Internacionalizar para usar chave i18n (`landing:modules.view_more` -> "Ver mais" / "Learn more" / "Ver mas").

---

## Fase 4 - Tornar Todo o Front-End Editavel (estilo WordPress)

### 4.1 Estrategia de edicao

O sistema ja possui a infraestrutura completa:
- `EditableText` - componente que permite edicao inline (admin clica, popover abre, edita e salva no `site_content`)
- `EditableImage` - mesmo conceito para imagens
- `SiteContentProvider` - contexto que carrega textos do banco
- `siteDefaultTexts.ts` - fallbacks quando nao ha dados no banco

**Abordagem**: Envolver cada texto estatico da landing page com `<EditableText>`. Para o admin logado, cada texto mostra um icone de lapis ao hover. Ao clicar, edita inline e salva no banco.

**Importante**: O `EditableText` usa o `site_content` (banco de dados), nao o i18n. Isso significa que os textos editados pelo admin sao **sobrepostos** aos textos do i18n. O fluxo e:
1. Texto base vem do i18n (`landing.json`)
2. Admin edita -> salva no `site_content`
3. Na proxima vez, o `getText()` retorna o valor do banco, sobrescrevendo o i18n

Para isso funcionar na landing, cada componente precisa usar `getText(contentKey)` como fonte primaria e `t('key')` como fallback. O componente `EditableText` ja faz isso internamente.

### 4.2 Componentes a tornar editaveis

| Componente | Textos a tornar editaveis |
|---|---|
| `LandingHero` | badge, title, subtitle, cta_primary, cta_secondary, trusts |
| `LandingBenefits` | titulo, subtitulo, 6x (titulo + descricao) |
| `LandingModules` | titulo, subtitulo, 6x (titulo + descricao) |
| `LandingHowItWorks` | titulo, subtitulo, 3x (titulo + descricao) |
| `LandingIntegrations` | titulo, subtitulo, 3x (titulo + descricao), 4x badges |
| `LandingDemo` | titulo, subtitulo |
| `LandingPricing` | titulo, subtitulo |
| `LandingTestimonials` | titulo, subtitulo, 3x (nome, role, content), 4x stats |
| `LandingFAQ` | titulo, subtitulo, 6x (pergunta + resposta) |
| `LandingCTA` | titulo, subtitulo |
| `LandingFooter` | descricao, copyright |
| **ModuloDetalhe** (novo) | titulo, descricao, funcionalidades, CTA |
| **Consultoria** (novo) | todos os textos |

Sao aproximadamente **80+ textos** que serao editaveis.

### 4.3 Registrar defaults no siteDefaultTexts

Adicionar todas as chaves novas (modulos atualizados, consultoria, paginas de detalhe) no `siteDefaultTexts.ts` para garantir fallback.

---

## Resumo de Arquivos

### Arquivos a Criar
| Arquivo | Descricao |
|---|---|
| `src/pages/Consultoria.tsx` | Pagina publica de consultoria |
| `src/pages/ModuloDetalhe.tsx` | Pagina template de detalhe de modulo |
| `src/content/modulePages.ts` | Dados dos modulos para paginas de detalhe |
| `src/locales/pt-BR/consultoria.json` | Traducoes pt-BR |
| `src/locales/en/consultoria.json` | Traducoes en |
| `src/locales/es/consultoria.json` | Traducoes es |

### Arquivos a Modificar
| Arquivo | Alteracao |
|---|---|
| `src/components/landing/LandingModules.tsx` | Novos modulos reais + EditableText |
| `src/components/landing/LandingIntegrations.tsx` | Remover Notas Fiscais, novo item |
| `src/components/landing/LandingBenefits.tsx` | Envolver com EditableText |
| `src/components/landing/LandingHero.tsx` | Envolver textos com EditableText |
| `src/components/landing/LandingHowItWorks.tsx` | Envolver com EditableText |
| `src/components/landing/LandingDemo.tsx` | Envolver com EditableText |
| `src/components/landing/LandingTestimonials.tsx` | Envolver com EditableText |
| `src/components/landing/LandingFAQ.tsx` | Envolver com EditableText |
| `src/components/landing/LandingCTA.tsx` | Envolver com EditableText |
| `src/components/landing/LandingFooter.tsx` | Envolver com EditableText |
| `src/components/landing/LandingHeader.tsx` | Adicionar Consultoria ao menu |
| `src/components/landing/FeatureCard.tsx` | Internacionalizar "Ver mais" |
| `src/locales/pt-BR/landing.json` | Atualizar modulos, remover fiscal, adicionar chaves |
| `src/locales/en/landing.json` | Idem em ingles |
| `src/locales/es/landing.json` | Idem em espanhol |
| `src/content/siteDefaultTexts.ts` | Adicionar todas as chaves novas |
| `src/App.tsx` | Adicionar rotas /consultoria e /modulo/:slug |
| `src/lib/i18n/index.ts` | Registrar namespace consultoria |
| Migracao SQL | Inserir registros SEO para paginas de modulo e consultoria |

---

## Ordem de Execucao Recomendada

Dado o volume, recomendo executar em **4 etapas**:

1. **Etapa 1**: Atualizar modulos na landing + remover Notas Fiscais + internacionalizar "Ver mais" (impacto visual imediato)
2. **Etapa 2**: Adicionar Consultoria ao menu + criar pagina de consultoria basica
3. **Etapa 3**: Criar paginas de detalhe dos modulos com SEO + integrar com Admin SEO
4. **Etapa 4**: Tornar todos os textos editaveis com EditableText (WordPress-like)

Cada etapa pode ser validada independentemente antes de prosseguir para a proxima. Posso comecar pela Etapa 1 agora?

