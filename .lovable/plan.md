
# Plano Corretivo: Modulo de Tendencias - 4 Problemas Identificados

## Diagnostico Detalhado

### Problema 1: Filtro de 30 e 90 dias nao funciona

**Causa raiz:** O filtro de periodo (`selectedPeriod`) so afeta duas coisas:
1. A query de **elegibilidade** (`useCategoryEligibility`) - que calcula KPIs do seller (pedidos, faturamento, unidades vendidas)
2. As queries de **performance do seller** (`seller/top-visitados`, `seller/top-vendidos`)

Porem, os dados que o usuario ve na tela principal (Tendencias de Mercado, Keywords, Mais Vendidos) vem de:
- `trend_snapshots` - snapshot unico sem filtro de periodo
- `highlights_snapshots` + `highlights_items` - snapshot unico sem filtro de periodo

**O que acontece:** Ao mudar de 7d para 30d ou 90d, os KPIs do seller (339 pedidos, R$37K) ate deveriam mudar, mas estao com cache expirado (calculado em 27/01 com `expires_at: 28/01`). O cache ja venceu e deveria recalcular. As secoes de mercado (Tendencias, Keywords, Best Sellers) nunca vao mudar porque sao snapshots pontuais, nao filtrados por periodo.

**Dados no banco:**
- `seller_category_eligibility` para `MLB109309`:
  - `last_7d`: NAO EXISTE
  - `last_30d`: 320 pedidos, R$33.682 (calculado 26/01, expirado)
  - `last_90d`: 1.298 pedidos, R$115.298 (calculado 27/01, expirado)

Os KPIs no screenshot mostram "339 pedidos, R$37K" que nao corresponde a nenhum dos dois periodos, indicando dados stale.

### Problema 2: "Mais Vendidos da Categoria" travado (0/5)

**Causa raiz:** O snapshot de highlights para a categoria `MLB109309` (Etiquetas e Rotulos) tem apenas **1 registro**, datado de **24/01/2026** com 8 itens. Porem, o componente `BestSellersSection` dispara um `auto-collect` via `onCollect()` quando esta vazio, que chama a edge function `trends-collect-public`. Se essa funcao falhar ou demorar demais, o componente fica num loop de "Buscando dados..." ou exibe "0/5".

O problema concreto: a funcao `trends-collect-public` provavelmente esta falhando silenciosamente (timeout ou erro da API do ML) ao tentar coletar dados para categorias de nivel mais profundo como `MLB109309`. O snapshot mais recente tem quase 2 semanas.

### Problema 3: Sem navegacao para cima/baixo na categoria

**Situacao atual:** O `SellerCategorySelector` mostra apenas as categorias detectadas do seller (lista plana). O `SubcategoryNavigator` existe mas so e acessado dentro do Collapsible quando o usuario abre "Ver todas as categorias". Nao ha breadcrumb visivel na tela principal nem botoes para subir/descer na arvore.

O breadcrumb (`useCategoryBreadcrumb`) e carregado mas nao e exibido na interface principal. Existe no `TrendsHeaderBar` mas a logica de click (`handleBreadcrumbClick`) e passada ao `SubcategoryNavigator` que esta escondido.

### Problema 4: Troca de empresa quebra o modulo

**Causa raiz:** O `autoLoadAttemptedRef` e resetado no `useEffect` que observa `state.selectedAccountId`, mas o fluxo de reset tem um problema:

1. Ao trocar empresa, `setAccount` muda `selectedAccountId`
2. O `useEffect` de reset seta `autoLoadAttemptedRef.current = false`
3. Mas o `useEffect` de auto-load verifica `!state.selectedAccountId || categoriesLoading || autoLoadAttemptedRef.current`
4. O `autoLoadAttemptedRef` muda para false, mas o `autoLoad.resetForAccount` compara o novo accountId com o anterior e pode nao resetar corretamente se o ref interno esta dessincronizado
5. Alem disso, o `TrendsContext` NAO limpa dados de mercado ao trocar conta (so limpa ao trocar categoria em `SET_CATEGORY`). O `SET_ACCOUNT` mantem `selectedCategoryId` e dados antigos.

---

## Correcoes Propostas

### Correcao 1: Filtro de periodo funcional

**Abordagem:** Dividir KPIs em dois grupos:
- **KPIs do Seller** (respondem ao periodo): Pedidos, Unidades Vendidas, Faturamento, Ticket Medio
- **KPIs de Mercado** (snapshot): Status da Categoria, Tendencias, Destaques, Interesse de Busca

O `TrendsQuickKpis` passara a exibir 2 linhas:
- Linha 1 (4 cards): KPIs de mercado (como esta hoje)
- Linha 2 (4 cards): KPIs do seller filtrados pelo periodo selecionado

Alem disso, garantir que a elegibilidade recalcule quando o cache estiver expirado, adicionando logica de refresh forcado quando `isExpired: true`.

**Mudanca no contexto:** `SET_PERIOD` deve limpar dados do seller e forcar recalculo, similar ao `SET_CATEGORY`.

### Correcao 2: Best Sellers com timeout e fallback

**Abordagem:**
- Adicionar timeout de 15 segundos ao auto-collect
- Se nao houver dados apos coleta, mostrar estado vazio claro (sem loop)
- Desabilitar auto-collect automatico -- tornar acao manual apenas
- Mostrar a data do ultimo snapshot ("Dados de 24/01/2026") e botao para atualizar

### Correcao 3: Breadcrumb de navegacao na categoria

**Abordagem:** Adicionar uma barra de breadcrumb visivel abaixo dos filtros:
- Exibir path completo da categoria selecionada (ex: "Papelaria > Etiquetas e Rotulos > Etiquetas Adesivas")
- Cada nivel do breadcrumb e clicavel para navegar para cima
- Botao "Ver subcategorias" ao lado para navegar para baixo
- Ao clicar num nivel pai, recarrega dados para essa categoria

### Correcao 4: Reset completo ao trocar empresa

**Abordagem:** Adicionar acao `RESET_FOR_ACCOUNT` no reducer que:
- Limpa `selectedCategoryId`, `selectedSubcategoryId`
- Limpa todos os dados (market + seller)
- Reseta flags de UI
- Reseta capabilities

No `Tendencias.tsx`, ao detectar mudanca de conta, chamar reset completo e re-trigger auto-load.

---

## Detalhamento Tecnico

### Arquivos modificados

| Arquivo | Acao |
|---------|------|
| `src/contexts/TrendsContext.tsx` | Adicionar acao `RESET_FOR_ACCOUNT` e `SET_PERIOD` com limpeza de seller data |
| `src/components/trends/TrendsQuickKpis.tsx` | Separar KPIs de mercado vs seller, adicionar linha de KPIs do seller |
| `src/components/trends/BestSellersSection.tsx` | Remover auto-collect, adicionar timeout, mostrar data do snapshot |
| `src/components/trends/TrendsHeaderBar.tsx` | Adicionar breadcrumb visivel e botao de subcategorias |
| `src/pages/Tendencias.tsx` | Corrigir fluxo de troca de conta com reset completo |
| `src/hooks/useCategoryEligibility.ts` | Forcar recalculo quando cache expirado |

### Arquivos NAO modificados

- Nenhuma Edge Function alterada
- Nenhuma migracao SQL
- Nenhuma RLS alterada
- Modulos de Custos, Anuncios, Perguntas, Mensagens inalterados

### Detalhe da Correcao 1 (Periodo)

No `TrendsContext.tsx`, a acao `SET_PERIOD` passara a:
```text
case 'SET_PERIOD':
  return {
    ...state,
    selectedPeriod: action.period,
    // Limpar dados do seller para forcar recalculo
    data: {
      ...state.data,
      sellerGoals: null,
      sellerSubcategories: null,
    },
    // Reset capabilities para reavaliar com novo periodo
    capabilities: {
      canUseSellerInsights: false,
      reason: 'NO_CATEGORY',
    },
  };
```

No `useCategoryEligibility`, adicionar logica para forcar recalculo se o cache estiver expirado (atualmente retorna dados expirados sem atualizar).

### Detalhe da Correcao 3 (Breadcrumb)

Adicionar componente `TrendsCategoryBreadcrumb` acima dos KPIs:
```text
Mercado Livre > Papelaria > Etiquetas e Rotulos
[Botao: Ver subcategorias v]
```

Cada item do breadcrumb chama `setCategory(id, name)` ao ser clicado. O botao "Ver subcategorias" abre um dropdown com os filhos da categoria atual.

### Detalhe da Correcao 4 (Troca de empresa)

No `Tendencias.tsx`, substituir o `setAccount` simples por:
```text
// Ao trocar conta, reset completo
if (newAccountId !== state.selectedAccountId) {
  dispatch({ type: 'RESET_FOR_ACCOUNT', accountId: newAccountId });
  autoLoadAttemptedRef.current = false;
}
```

---

## Resultado Esperado

- Filtro de 7/30/90 dias atualiza KPIs do seller (pedidos, faturamento) com dados reais recalculados
- KPIs de mercado (tendencias, keywords) permanecem estaveis pois sao snapshots
- Best Sellers mostra dados existentes com data do snapshot, sem loop infinito
- Breadcrumb visivel permite navegar para categorias pai/filha
- Troca de empresa reseta completamente o modulo e recarrega dados da nova conta
