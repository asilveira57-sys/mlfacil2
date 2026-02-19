
# Cache de Metricas Diarias de ADS

## Problema Atual

Cada vez que o usuario muda o filtro de data (7d, 30d, 90d), a edge function `ads-period-metrics` faz chamadas em tempo real para a API do ML buscando metricas de **todos os itens** (165+), levando ~30 segundos. A tabela `ads_daily_metrics` existe mas tem **0 registros**.

## Estrategia: Cache por Dia no Banco

Dados de dias passados **nunca mudam**. Podemos buscar da API apenas uma vez e guardar permanentemente. Apenas o dia de hoje precisa ser atualizado.

```text
Requisicao: 90 dias
    |
    v
1. Buscar no banco: dias ja cacheados (ex: 85 dias)
2. Buscar da API: apenas dias faltantes (ex: 5 dias)
3. Salvar novos dias no banco
4. Retornar tudo agregado
    |
    v
Tempo: ~2s (banco) + ~3s (5 dias da API) = ~5s
Proxima vez mesmo periodo: ~2s (tudo do banco)
```

## Mudancas Tecnicas

### 1. Nova Tabela: `ads_period_cache`

Tabela simplificada para cache de metricas agregadas por dia/seller (sem dependencia de campaign_id que a `ads_daily_metrics` exige como FK):

```text
ads_period_cache
- seller_id (text)
- user_id (uuid)
- metric_date (date)
- total_spent (numeric)
- total_revenue (numeric)
- total_clicks (integer)
- total_impressions (integer)
- total_conversions (integer)
- items_data (jsonb) -- detalhes por item
- campaigns_data (jsonb) -- detalhes por campanha
- fetched_at (timestamptz)
- UNIQUE(seller_id, metric_date)
```

Motivo de nao usar `ads_daily_metrics`: ela exige `campaign_id` (FK obrigatorio), fragmentando os dados por campanha. O cache precisa ser agregado por dia.

### 2. Edge Function `ads-period-metrics` (Refatorar)

Nova logica:

1. Recebe `seller_id`, `date_from`, `date_to`
2. Busca no `ads_period_cache` todos os dias do periodo
3. Identifica dias faltantes (nunca cacheados) + dia de hoje (sempre refetch)
4. Para dias faltantes: busca da API ML **apenas esses dias**, um a um ou em lote
5. Salva novos dias no cache
6. Agrega todos os dias e retorna o resultado

Logica de invalidacao:
- Dias anteriores a hoje: cache permanente (dados nao mudam)
- Dia de hoje: sempre refetch (dados podem mudar ao longo do dia)
- TTL opcional de 1h para dia de hoje (evitar chamadas excessivas)

### 3. Backfill Inicial (Edge Function `ads-backfill-cache`)

Nova edge function que:
- Busca os ultimos 365 dias, dia a dia
- Processa em lotes de 7 dias por execucao (respeitar timeout de 50s)
- Usa estado resumivel (`ads_backfill_state`) para continuar de onde parou
- Pode ser disparado manualmente ou via cron diario

### 4. Hook Frontend (Ajustar `useAdsPeriodMetrics`)

Sem mudancas na interface do hook. A melhoria e transparente -- o backend responde mais rapido porque usa cache.

## Fluxo Apos Implementacao

```text
PRIMEIRA VEZ (backfill):
  cron/manual -> ads-backfill-cache
  Dia 1: busca dias 1-7 da API, salva no cache
  Dia 2: busca dias 8-14, salva...
  ...ate 365 dias

USO DIARIO:
  Usuario seleciona "90d"
  -> Edge function busca 90 dias do banco (~100ms)
  -> Refetch apenas hoje da API (~3s)
  -> Retorna em ~3s total

  Usuario muda para "30d"
  -> Tudo no banco, retorna em ~500ms
```

## Resultado Esperado

- Primeira carga apos backfill: **2-3 segundos** (vs 30s atual)
- Troca de filtro com dados cacheados: **menos de 1 segundo**
- Dados historicos precisos e permanentes
- Apenas o dia corrente consulta a API ML

## Arquivos Afetados

1. **Nova migracao SQL**: criar tabela `ads_period_cache` com RLS
2. **`supabase/functions/ads-period-metrics/index.ts`**: refatorar para usar cache-first
3. **Novo `supabase/functions/ads-backfill-cache/index.ts`**: backfill de 365 dias com estado resumivel
4. **`src/hooks/useAdsPeriodMetrics.ts`**: sem mudancas (transparente)
