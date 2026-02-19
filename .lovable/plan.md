
# Metricas Organico vs Publicidade com Protecoes

## Resumo

Cruzar dados de vendas totais (`meli_orders_cache`) com dados de ADS (`ads_period_cache`) para calcular metricas de organico vs publicidade, TACOS geral e custo por venda. Todas as consultas com paginacao automatica (sem limite de 1000 registros) e tratamento de rate limit na API do ML.

## Protecoes Aplicadas

1. **Rate Limit (429)**: Todas as chamadas a API do ML passam por `fetchWithRetry()` com backoff exponencial (ate 3 tentativas)
2. **Sem limite de registros**: Todas as consultas ao banco usam `fetchAllRows()` com paginacao automatica via `.range()`
3. **Tratamento de erro robusto**: try/catch em todas as chamadas externas, fallback para zero quando dados indisponiveis

## Arquivos Afetados

### 1. Edge Function `ads-period-metrics/index.ts` (Refatorar)

Mudancas:
- Adicionar `fetchWithRetry()` para todas as chamadas a API do ML (campanhas, itens, metricas)
- Adicionar `fetchAllRows()` local para consultas ao banco sem limite de 1000
- Apos agregar dados ADS do cache, consultar `meli_orders_cache`:
  - Buscar pedidos `paid` no periodo (com paginacao)
  - Buscar pedidos `cancelled/refunded` no periodo (para receita liquida)
  - Agrupar por dia para serie temporal
- Calcular novos campos na resposta:
  - `total_seller_revenue` (faturamento liquido = paid - cancelled)
  - `total_seller_orders` (pedidos pagos)
  - `organic_revenue` (seller - ads)
  - `organic_percent` / `paid_percent`
  - `tacos_total` (gasto ADS / faturamento total)
  - `cost_per_sale_general` (gasto / pedidos totais)
  - `cost_per_sale_ads` (gasto / conversoes ADS)
- Daily time series inclui: `seller_revenue`, `organic_revenue`, `seller_orders`

### 2. Tipo `AdsMetricsSummary` em `src/types/ads.ts`

Adicionar campos:
```
total_seller_revenue: number
total_seller_orders: number
total_cancelled_revenue: number
total_cancelled_orders: number
organic_revenue: number
organic_percent: number
paid_percent: number
tacos_total: number
cost_per_sale_general: number
cost_per_sale_ads: number
```

### 3. Hook `useAdsPeriodMetrics.ts`

- Ampliar `PeriodDailyPoint` com `seller_revenue`, `organic_revenue`, `seller_orders`
- Mapear novos campos da resposta para o `AdsMetricsSummary`
- Atualizar `emptySummary` com novos campos zerados

### 4. KPI Cards `AdsKpiCards.tsx`

Reorganizar em 2 blocos visuais (12 cards no total):

**Bloco 1 - Visao do Negocio (4 cards):**
- Faturamento Total (liquido, com badge "X% organico")
- Receita Organica
- Receita via ADS
- TACOS Geral (gasto / faturamento total)

**Bloco 2 - Performance ADS (4 cards):**
- Gasto Total
- ROAS Medio
- Custo por Venda (geral)
- Custo por Venda (ADS)

**Bloco 3 - Detalhes (4 cards):**
- CPC Medio
- ACOS Medio
- No Prejuizo
- Escalaveis

### 5. Grafico `AdsSpendRevenueChart.tsx`

- Adicionar toggle com 2 visualizacoes:
  - "Gasto vs Receita" (atual)
  - "Organico vs Publicidade" (area empilhada com organico + ADS + linha de gasto)
- Terceira serie "Faturamento Total" no grafico existente
- `PeriodDailyPoint` atualizado com `seller_revenue` e `organic_revenue`

### 6. Pagina `Publicidade.tsx`

- Sem mudancas estruturais, apenas passa os novos dados que ja vem do hook

## Fluxo de Dados

```text
Frontend (30d) -> ads-period-metrics
  |
  |-- 1. ads_period_cache (paginado, sem limite)
  |-- 2. meli_orders_cache WHERE paid (paginado, sem limite)
  |-- 3. meli_orders_cache WHERE cancelled (paginado, sem limite)
  |-- 4. ML API so para dias faltantes (com retry 429)
  |
  v
Agrega: organico = seller_revenue - ads_revenue
Retorna tudo em uma unica chamada (~2s se tudo cacheado)
```

## Detalhes Tecnicos

### fetchWithRetry (Rate Limit)
```text
Para cada chamada a API do ML:
1. Faz a requisicao
2. Se status 429: espera retry-after * (attempt+1) segundos
3. Tenta ate 3 vezes com backoff
4. Se falhar, retorna ultimo response
```

### fetchAllRows (Paginacao DB)
```text
Para cada consulta ao banco:
1. Busca .range(0, 999)
2. Se retornou 1000 rows, busca .range(1000, 1999)
3. Repete ate retornar menos que 1000
4. Concatena tudo e retorna
```
