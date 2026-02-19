
# Melhorias no Dashboard ADS

## Resumo das mudancas

1. **KPI Cards mais compactos** - Reduzir padding/espacamento e adicionar 3 novos cards (TACOS Campanha, TACOS Total, CPC Medio)
2. **Filtro de periodo** - Adicionar barra de filtros 7d, 14d, 30d, 60d, 90d e Personalizado no dashboard
3. **Grafico Gasto x Receita** - Alimentar com dados agregados dos `ads_items` em vez de depender do `ads_daily_metrics` (que esta vazio)
4. **Remover botao Sincronizar do header** - Remover de `headerContent` no PageContainer
5. **Adicionar Sincronizar na aba Campanhas** - Colocar ao lado da barra de pesquisa

---

## Detalhes Tecnicos

### 1. AdsKpiCards - Layout compacto + novos cards

**Arquivo:** `src/components/ads/AdsKpiCards.tsx`

- Reduzir padding de `p-4` para `p-2.5`
- Reduzir fonte do valor de `text-xl` para `text-lg`
- Adicionar ao `AdsMetricsSummary` os campos `avg_cpc` e `avg_tacos`
- Adicionar 3 novos cards:
  - **CPC Medio**: `total_spent / total_clicks`
  - **TACOS Campanha**: igual ao ACOS medio (gasto ADS / receita ADS)
  - **TACOS Total**: `total_spent / (total_revenue + receita_organica)` - como nao temos receita organica no modulo ADS, calcular como `total_spent / receita_total_meli` (usando dados de vendas)
- Mudar grid para `lg:grid-cols-4` com 2 linhas para caber mais cards

### 2. Filtro de periodo no Dashboard

**Arquivo:** `src/pages/Publicidade.tsx`

- Substituir o calculo fixo de `thirtyDaysAgo` por um estado `datePeriod` com opcoes: `7d`, `14d`, `30d`, `60d`, `90d`, `custom`
- Adicionar componente de filtro (botoes tipo pills) logo acima dos KPI cards
- Para "Personalizado": mostrar 2 date pickers (de/ate)
- O `dateFrom` e `dateTo` sao recalculados dinamicamente com base no periodo selecionado
- Passar esses valores para `useAdsMetricsSummary`, `useAdsDailyMetrics` e o grafico

### 3. Grafico Gasto x Receita - usar dados reais

**Arquivo:** `src/components/ads/AdsSpendRevenueChart.tsx`

O grafico depende de `ads_daily_metrics` que esta vazio. Alternativa: aceitar tambem dados agregados dos items.

**Arquivo:** `src/pages/Publicidade.tsx`

- Criar dados do grafico a partir dos `ads_items` (agrupando por data de `synced_at` ou usando o `spent_total` e `revenue_from_ads` agregados)
- Alternativa mais simples: passar os dados do `summary` como fallback quando `metrics` esta vazio, mostrando pelo menos o total acumulado como um ponto no grafico

Na pratica, como nao temos serie temporal nos items, a melhor abordagem e:
- Usar os `ads_items` com seus valores de `spent` e `revenue_from_ads` para mostrar um grafico de barras por campanha (top 10 campanhas) em vez de serie temporal quando `ads_daily_metrics` esta vazio

### 4. Remover Sincronizar do header global

**Arquivo:** `src/pages/Publicidade.tsx`

- Remover o `<Button>Sincronizar</Button>` do `headerContent`
- Manter apenas o badge de alertas no header (se houver)

### 5. Adicionar Sincronizar na aba Campanhas

**Arquivo:** `src/pages/Publicidade.tsx` (aba campaigns) e `src/components/ads/AdsCampaignsTable.tsx`

- Na aba Campanhas, ao lado do titulo "Todas as Campanhas" e da barra de pesquisa, adicionar um botao compacto de sincronizacao
- Passar `triggerSync` e `syncState` como props para o `AdsCampaignsTable` ou colocar direto no `CardHeader` da aba Campanhas

### 6. Atualizar tipo AdsMetricsSummary

**Arquivo:** `src/types/ads.ts`

Adicionar campos:
```text
avg_cpc: number;
avg_tacos: number;
```

### 7. Atualizar useAdsMetricsSummary

**Arquivo:** `src/hooks/useAds.ts`

Calcular os novos campos:
```text
avg_cpc = total_clicks > 0 ? total_spent / total_clicks : 0
avg_tacos = total_revenue > 0 ? (total_spent / total_revenue) * 100 : 0
```

Tornar o hook responsivo ao `dateFrom`/`dateTo` filtrando items por periodo (se possivel via `synced_at`).

---

## Arquivos Modificados

| Arquivo | Mudanca |
|---------|---------|
| `src/types/ads.ts` | Adicionar `avg_cpc`, `avg_tacos` ao `AdsMetricsSummary` |
| `src/hooks/useAds.ts` | Calcular `avg_cpc` e `avg_tacos` no summary |
| `src/components/ads/AdsKpiCards.tsx` | Layout compacto, 3 novos cards |
| `src/pages/Publicidade.tsx` | Filtro de periodo, remover sync do header, adicionar sync na aba campanhas, grafico fallback |
| `src/components/ads/AdsSpendRevenueChart.tsx` | Aceitar fallback de dados de campanhas quando metrics vazio |
