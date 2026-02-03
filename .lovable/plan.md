

# Plano: Ferramentas Públicas Gratuitas (Front-End)

## Objetivo

Criar 3 páginas públicas isoladas no front-end, acessíveis sem login, organizadas sob um menu "Ferramentas" no header público. Essas ferramentas são demonstrativas e não compartilham código com módulos pagos.

---

## Arquitetura de Isolamento

```text
src/
├── pages/
│   └── tools/                          # Novo diretório isolado
│       ├── ToolsLayout.tsx             # Layout com header/footer público
│       ├── ZplViewerTool.tsx           # Visualizador ZPL (API Labelary)
│       ├── TrendsLiteTool.tsx          # Tendências simplificada
│       └── PricingSimulatorTool.tsx    # Simulador de precificação
├── components/
│   └── tools/                          # Componentes exclusivos (não reutilizam módulos pagos)
│       ├── ZplCodeEditor.tsx           # Editor de código ZPL
│       ├── ZplPreviewCard.tsx          # Card de preview da etiqueta
│       ├── TrendsLiteCard.tsx          # Card de tendência simplificado
│       ├── TrendsLiteFilters.tsx       # Filtros básicos
│       ├── PricingInputForm.tsx        # Formulário de custos/taxas
│       ├── PricingResultDisplay.tsx    # Exibição de resultado
│       ├── ToolsPromoCard.tsx          # Card promocional do sistema completo
│       └── index.ts                    # Barrel export
└── locales/
    ├── pt-BR/tools.json                # Traduções PT-BR
    ├── en/tools.json                   # Traduções EN
    └── es/tools.json                   # Traduções ES
```

---

## Rotas Públicas (Sem Autenticação)

| Rota | Página | Descrição |
|------|--------|-----------|
| `/ferramentas/zpl` | ZplViewerTool | Visualizador de etiquetas ZPL |
| `/ferramentas/tendencias` | TrendsLiteTool | Tendências versão lite |
| `/ferramentas/precificacao` | PricingSimulatorTool | Simulador de preços |

Todas as rotas ficam **fora** do `AppShellLayout` (sem sidebar), usando o mesmo padrão de `/planos` e `/blog`.

---

## Modificações no Header Público

Adicionar novo item "Ferramentas" no menu do `LandingHeader.tsx`:

```typescript
const navItems = [
  { label: t('header.menu_recursos'), href: "#recursos" },
  { label: t('header.menu_ferramentas'), href: "/ferramentas/zpl" }, // NOVO
  // ... resto do menu
];
```

---

## Detalhamento por Ferramenta

### 1. Etiqueta ZPL (Visualizador)

**Funcionalidades:**
- Campo de texto (textarea) para inserção de código ZPL
- Botão "Renderizar" que chama a API Labelary
- Preview da imagem PNG gerada
- Botão de download da imagem
- Aviso institucional sobre recursos avançados

**API Labelary (externa, sem backend):**
```text
POST https://api.labelary.com/v1/printers/8dpmm/labels/{width}x{height}/0/
Content-Type: application/x-www-form-urlencoded
Accept: image/png
Body: [código ZPL]
```

**Características:**
- 100% client-side (fetch direto do navegador)
- Sem persistência
- Dimensões default: 105mm x 150mm (padrão ML)

### 2. Tendências (Versão Lite)

**Funcionalidades:**
- Lista estática de 10-20 termos/produtos em destaque
- Filtro simples por categoria (dropdown)
- Ordenação por relevância ou popularidade
- Dados hardcoded ou JSON estático (sem API interna)

**Dados estáticos (exemplo):**
```typescript
const TRENDS_DATA = [
  { term: "Fone Bluetooth", category: "Eletrônicos", popularity: 95 },
  { term: "Capinha iPhone 15", category: "Acessórios", popularity: 88 },
  // ...
];
```

**Características:**
- Sem histórico ou personalização
- Sem cruzamento de dados reais
- Card promocional para módulo completo

### 3. Precificação (Simulador)

**Funcionalidades:**
- Campos de entrada:
  - Preço de venda
  - Custo do produto
  - Taxa do marketplace (%)
  - Custo de frete
  - Custo de embalagem
  - Outras despesas
- Cálculo automático em tempo real:
  - Lucro líquido
  - Margem de lucro (%)
  - Ponto de equilíbrio
- Exibição visual clara dos resultados

**Fórmulas (in-memory):**
```typescript
const taxas = precoVenda * (taxaMarketplace / 100);
const custoTotal = custoProduto + custoFrete + custoEmbalagem + outrasDespesas;
const lucro = precoVenda - taxas - custoTotal;
const margem = (lucro / precoVenda) * 100;
```

**Características:**
- Cálculo 100% no navegador
- Sem salvamento
- Sem associação com contas

---

## Layout Compartilhado (ToolsLayout)

Página wrapper que usa header/footer público:

```typescript
export function ToolsLayout({ children }) {
  return (
    <div className="min-h-screen bg-background">
      <LandingHeader />
      <main className="pt-20 pb-16">
        {children}
      </main>
      <LandingFooter />
    </div>
  );
}
```

---

## Traduções (i18n)

Novo namespace `tools` com suporte a pt-BR, en, es:

```json
{
  "menu_title": "Ferramentas",
  "zpl": {
    "title": "Visualizador de Etiquetas ZPL",
    "subtitle": "Renderize e baixe etiquetas ZPL gratuitamente",
    "input_placeholder": "Cole seu código ZPL aqui...",
    "btn_render": "Renderizar",
    "btn_download": "Baixar imagem",
    "disclaimer": "Ferramenta gratuita para visualização. Recursos avançados como conversão em lote e histórico estão disponíveis no MKTP Fácil."
  },
  "trends": {
    "title": "Tendências do Mercado",
    "subtitle": "Veja o que está em alta no Mercado Livre",
    "filter_category": "Categoria",
    "filter_all": "Todas",
    "sort_popularity": "Popularidade",
    "sort_relevance": "Relevância",
    "disclaimer": "Versão simplificada. Análises completas, histórico e inteligência de mercado estão disponíveis no MKTP Fácil."
  },
  "pricing": {
    "title": "Simulador de Precificação",
    "subtitle": "Calcule margem e lucro dos seus produtos",
    "sale_price": "Preço de venda",
    "product_cost": "Custo do produto",
    "marketplace_fee": "Taxa do marketplace (%)",
    "shipping_cost": "Custo de frete",
    "packaging_cost": "Custo de embalagem",
    "other_costs": "Outras despesas",
    "result_profit": "Lucro líquido",
    "result_margin": "Margem de lucro",
    "disclaimer": "Simulação básica. Salve cenários, compare resultados e integre dados reais no MKTP Fácil."
  },
  "promo": {
    "title": "Quer mais recursos?",
    "description": "Acesse análises completas, histórico e automações no MKTP Fácil.",
    "cta": "Conhecer o sistema"
  }
}
```

---

## Modificações em Arquivos Existentes

| Arquivo | Alteração |
|---------|-----------|
| `src/App.tsx` | Adicionar 3 rotas públicas (`/ferramentas/*`) |
| `src/components/landing/LandingHeader.tsx` | Adicionar item "Ferramentas" no menu |
| `src/lib/i18n/index.ts` | Registrar namespace `tools` |
| `src/locales/*/landing.json` | Adicionar `header.menu_ferramentas` |

---

## Regras Críticas de Implementação

1. **Isolamento total**: Nenhum import de hooks, componentes ou serviços dos módulos pagos
2. **Sem autenticação**: Páginas acessíveis sem sessão ativa
3. **Sem persistência**: Nenhum dado salvo em banco ou localStorage
4. **Sem APIs internas**: Apenas chamadas externas (Labelary) ou dados estáticos
5. **Componentes novos**: Criar componentes em `src/components/tools/` sem reutilizar de outros diretórios

---

## Ordem de Implementação

1. **Fase 1 - Estrutura Base**
   - Criar traduções (`tools.json` em 3 idiomas)
   - Registrar namespace no i18n
   - Criar `ToolsLayout.tsx`
   - Adicionar item no menu do header

2. **Fase 2 - Visualizador ZPL**
   - Criar componentes `ZplCodeEditor` e `ZplPreviewCard`
   - Implementar página `ZplViewerTool.tsx`
   - Integrar com API Labelary

3. **Fase 3 - Tendências Lite**
   - Criar dados estáticos de tendências
   - Criar componentes `TrendsLiteCard` e `TrendsLiteFilters`
   - Implementar página `TrendsLiteTool.tsx`

4. **Fase 4 - Simulador de Precificação**
   - Criar componentes `PricingInputForm` e `PricingResultDisplay`
   - Implementar página `PricingSimulatorTool.tsx`
   - Lógica de cálculo in-memory

5. **Fase 5 - Finalização**
   - Registrar rotas no App.tsx
   - Testar navegação e traduções
   - Adicionar card promocional em cada página

