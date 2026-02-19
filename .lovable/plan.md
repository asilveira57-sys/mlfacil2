

# Plano: Filtros de Data Funcionais no Dashboard ADS

## Problema Identificado

A tabela `ads_items` armazena **totais acumulados dos ultimos 30 dias** vindos da API do Mercado Livre. Nao existe granularidade diaria nessa tabela -- todos os registros mostram o mesmo valor independente do periodo selecionado. A tabela `ads_daily_metrics` existe mas esta **vazia** (0 registros).

O sync atual (edge function `ads-sync`) busca metricas com `date_from` e `date_to` fixos em 30 dias e grava um unico registro por campanha em `ads_daily_metrics` (na data de hoje), perdendo a informacao diaria.

## Solucao Proposta

Criar uma **nova edge function** (`ads-period-metrics`) que consulta a API do Mercado Livre em tempo real com o periodo selecionado pelo usuario, retornando as metricas agregadas. Os KPIs do dashboard serao alimentados por essa funcao em vez de dados estaticos.

### Etapa 1: Edge Function `ads-period-metrics`

Nova funcao backend que:
- Recebe `seller_id`, `date_from`, `date_to`
- Autentica o usuario e obtem o token ML
- Chama a API de campanhas e items do ML com o periodo solicitado (mesmos endpoints que o `ads-sync` ja usa, mas com datas dinamicas)
- Retorna metricas agregadas: gasto, receita, cliques, impressoes, conversoes, ACOS, ROAS, CPC

```text
Frontend (periodo: 7d)
    |
    v
Edge Function ads-period-metrics
    |-- date_from=2026-02-12, date_to=2026-02-19
    |
    v
ML API /product_ads/campaigns/search?date_from=...&date_to=...
ML API /product_ads/items/{id}?date_from=...&date_to=...
    |
    v
Retorna { total_spent, total_revenue, total_clicks, ... }
```

### Etapa 2: Novo Hook `useAdsPeriodMetrics`

Hook React que:
- Chama a edge function `ads-period-metrics` quando o periodo muda
- Retorna um `AdsMetricsSummary` compativel com o componente `AdsKpiCards`
- Mostra estado de loading enquanto busca
- Faz cache do resultado para evitar chamadas repetidas ao trocar abas

### Etapa 3: Atualizar Dashboard

- `AdsKpiCards` passa a usar os dados do `useAdsPeriodMetrics` (metricas do periodo) em vez do `useAdsMetricsSummary` (totais cumulativos)
- Os cards de "Campanhas Ativas/Pausadas" e "Produtos Anunciados" continuam usando dados locais (contagem, nao depende de periodo)
- O grafico de Gasto vs Receita continua usando `ads_daily_metrics` + fallback por campanha

### Etapa 4: Melhorar o Sync para Popular `ads_daily_metrics`

Modificar a funcao `ads-sync` para buscar metricas com granularidade diaria (iterando dia a dia ou usando endpoint de breakdown) e popular a tabela `ads_daily_metrics` corretamente. Isso permitira que o grafico de serie temporal tambem funcione com filtros de data.

---

## Detalhes Tecnicos

### Edge Function `ads-period-metrics`

```text
POST /ads-period-metrics
Body: { seller_id, date_from, date_to }
Response: {
  total_spent, total_revenue, total_clicks,
  total_impressions, total_conversions,
  avg_acos, avg_roas, avg_cpc, avg_tacos,
  products_at_loss, products_scalable,
  campaigns: [{ name, spent, revenue, clicks, ... }],
  items: [{ item_id, title, spent, revenue, acos, roas, ... }]
}
```

A funcao reutiliza a logica existente de `ads-sync` (refresh de token, endpoints da API ML) sem duplicar codigo, importando helpers compartilhados.

### Hook `useAdsPeriodMetrics`

- Parametros: `sellerId`, `dateFrom`, `dateTo`
- Usa `useCallback` com debounce para evitar chamadas excessivas ao mudar periodo
- Retorna `{ summary, items, campaigns, loading, error }`

### Mudancas em `Publicidade.tsx`

- Substituir `useAdsMetricsSummary(enrichedItems)` por `useAdsPeriodMetrics(sellerId, dateFrom, dateTo)`
- Os KPI cards recebem `periodSummary` em vez de `summary`
- A tabela de campanhas no dashboard tambem usa dados do periodo

### Impacto

- Sem migracao de banco necessaria (tabelas ja existem)
- KPIs passam a refletir o periodo selecionado exatamente como no Mercado Livre
- Performance aceitavel (chamada API ML leva 1-3 segundos)
- Fallback para dados cumulativos se a chamada falhar

