
# Plano Corretivo REAL: Modulo de Tendencias

## Causa Raiz de TODOS os Problemas

**Todas as correcoes anteriores foram aplicadas nos ARQUIVOS ERRADOS.**

A rota `/tendencias` renderiza `TendenciasV2.tsx`, NAO `Tendencias.tsx`.

```
src/App.tsx linha 150:
  <Route path="/tendencias" element={<TendenciasV2 />} />
```

Os arquivos corrigidos anteriormente (`Tendencias.tsx`, `TrendsContext.tsx`, `TrendsHeaderBar.tsx`, `TrendsQuickKpis.tsx`, `BestSellersSection.tsx`, `TrendsCategoryBreadcrumb.tsx`) sao da versao V1 que **NAO e usada**.

A versao ativa (V2) usa:
- `src/pages/TendenciasV2.tsx` (estado local com useState, sem Context)
- `src/hooks/useTrendsDataCache.ts` (cache proprio)
- `src/components/trends-v2/TrendsFiltersBar.tsx`
- `src/components/trends-v2/TrendsOverviewCards.tsx`
- `src/components/trends-v2/TrendsBestSellersCard.tsx`
- `src/components/trends-v2/TrendsKeywordsCard.tsx`
- `src/components/trends-v2/TrendsStatusBanner.tsx`

---

## Problemas Reais no Codigo V2

### 1. Troca de empresa nao detecta

No `TendenciasV2.tsx`, `handleAccountChange` limpa a categoria. Mas o useEffect de auto-selecao (linha 171-204) tem a condicao `if (selectedCategoryId) return;` que deveria permitir a re-selecao. O problema e que `sellerCategories` usa `placeholderData` do React Query, entao dados STALE da conta anterior podem ser usados para auto-selecionar uma categoria da conta errada. Alem disso, o useEffect pode executar antes dos novos `sellerCategories` carregarem e cair no fallback (categorias raiz).

**Correcao:** Invalidar o cache de `sellerCategories` ao trocar conta. Aguardar `categoriesLoading === false` antes de auto-selecionar. Limpar memoria cache do `useTrendsDataCache` ao trocar conta.

### 2. Filtro de periodo nao muda nada

O `handlePeriodChange` apenas faz `setSelectedPeriod(period)`. A query de elegibilidade (`useEligibilityCached`) usa `placeholderData: (prev) => prev`, que mostra os dados do periodo ANTERIOR enquanto o novo carrega. O componente `TrendsOverviewCards` nao mostra nenhum indicador de loading durante a transicao (porque `isLoadingEligibility` e `false` com placeholderData).

**Correcao:** Remover `placeholderData` da query de elegibilidade para que o loading state seja visivel. Adicionar o label do periodo nos cards do seller (ex: "Ultimos 30d" vs "Ultimos 90d"). Invalidar o cache de memoria ao trocar periodo.

### 3. Sem navegacao por categoria (breadcrumb)

O V2 usa um `Select` simples com lista plana de categorias do seller + categorias raiz. Nao existe breadcrumb, nao existe navegacao para cima (pai) ou para baixo (subcategorias). O componente `TrendsCategoryBreadcrumb` criado anteriormente existe mas NAO e importado no V2.

**Correcao:** Importar e renderizar `TrendsCategoryBreadcrumb` no `TendenciasV2.tsx`, entre o status banner e os KPIs. O componente ja funciona corretamente - busca o path via API do ML e permite clicar em niveis pai e ver subcategorias. Adaptar para usar os handlers do V2 (`handleCategoryChange`) em vez do TrendsContext.

### 4. Mais Vendidos travado (0/5)

O console mostra que o fetch de highlights demora ~16 segundos. O timeout de 12s dispara. Alem disso, o badge "0/5" e o progresso de enrichment (`useCatalogEnrichment`) que fica travado. O problema real e que a API `trends-api/mercado/highlights` e muito lenta para categorias profundas.

**Correcao:** Usar os items da resposta diretamente (sem enrichment obrigatorio) quando o enrichment falha. Mostrar data do snapshot existente. O timeout de 12s ja existe no V2 - apenas garantir que o fallback funciona corretamente e nao mostra "0/5" infinitamente.

---

## Detalhamento Tecnico

### Arquivo 1: `src/pages/TendenciasV2.tsx`

Mudancas:
- Importar e renderizar `TrendsCategoryBreadcrumb` (adaptado para V2)
- Corrigir `handleAccountChange`: limpar memoria cache, invalidar queries de seller categories
- Corrigir auto-selecao: aguardar `categoriesLoading === false` e verificar que `sellerCategories` e para a conta certa
- Corrigir `handlePeriodChange`: limpar eligibility cache de memoria
- Corrigir bug `unitsSold: eligibility.ordersCount` para usar valor correto

### Arquivo 2: `src/hooks/useTrendsDataCache.ts`

Mudancas:
- Adicionar funcao `clearAccountCache()` para limpar cache de memoria ao trocar conta
- Adicionar funcao `clearEligibilityCache()` para limpar ao trocar periodo
- Remover `placeholderData` da query de elegibilidade
- Exportar funcao de limpeza seletiva

### Arquivo 3: `src/components/trends-v2/TrendsOverviewCards.tsx`

Mudancas:
- Adicionar label do periodo nos subtitulos dos seller KPIs (ex: "Ultimos 30 dias")
- Mostrar skeleton quando eligibility esta loading (em vez de dados stale)

### Arquivo 4: `src/components/trends-v2/TrendsBestSellersCard.tsx`

Mudancas:
- Quando enrichment falha ou trava, usar items originais (sem enrichment) como fallback
- Nao mostrar badge "0/5" quando enrichment esta travado por mais de 5 segundos

### Arquivo 5: Criar `src/components/trends-v2/TrendsCategoryBreadcrumbV2.tsx`

Novo componente que:
- Usa `useCategoryBreadcrumb` (ja existente) para buscar o path
- Usa `useSubcategories` (ja existente) para mostrar filhos
- Recebe `onCategoryChange` como prop (sem depender do TrendsContext)
- Renderiza breadcrumb clicavel + botao "Subcategorias"

### Limpeza: Remover arquivos V1 nao utilizados

Arquivos que podem ser removidos (nao sao renderizados por nenhuma rota):
- `src/pages/Tendencias.tsx`
- `src/components/trends/TrendsHeaderBar.tsx`
- `src/components/trends/TrendsQuickKpis.tsx`
- `src/components/trends/BestSellersSection.tsx`
- `src/components/trends/TrendsCategoryBreadcrumb.tsx`
- `src/hooks/useTrendsAutoLoad.ts`

(Nota: a remocao sera feita apenas se nao houver outras referencias. Verificarei antes.)

---

## Arquivos NAO Modificados

- Nenhuma Edge Function
- Nenhuma migracao SQL
- Nenhuma RLS
- TrendsContext.tsx (V1 - nao usado)
- Modulos de Custos, Anuncios, Perguntas, etc.

## Resultado Esperado

- Trocar empresa: limpa cache, recarrega categorias da nova conta, auto-seleciona a melhor
- Trocar periodo: KPIs do seller atualizam visivelmente (com loading), mostrando dados do novo periodo
- Breadcrumb visivel: permite navegar para categoria pai ou explorar subcategorias
- Best Sellers: nao trava em "0/5", mostra dados disponiveis ou estado vazio claro
