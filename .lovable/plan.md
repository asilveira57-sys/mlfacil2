

# Corrigir Performance e Dados Zerados no Dashboard ADS

## Diagnostico

O cache (`ads_period_cache`) esta **completamente vazio** (0 linhas). Cada vez que voce abre a pagina, a Edge Function tenta re-buscar **todos os 30 dias** na API do Mercado Livre. O problema critico e arquitetural:

Para **cada dia faltante**, a funcao atual faz:
- 1 chamada `discoverItems` (que pagina ~165 itens = 2 chamadas)
- 165 chamadas `fetchItemMetricsBatch` (uma por item)
- 1+ chamadas `fetchCampaigns`

Para 30 dias: **30 x 168 = ~5.040 chamadas a API**. Isso estoura o rate limit (429), a API retorna zeros, o guarda impede o cache, e no proximo carregamento tudo recomeça do zero. Um ciclo infinito de lentidao e dados vazios.

## Solucao

Reestruturar a Edge Function para buscar dados de forma **inteligente e eficiente**:

### 1. Descobrir itens UMA vez (nao por dia)
Mover `discoverItems` para fora do loop de dias. Atualmente e chamado 30 vezes; passara a ser chamado 1 vez.

### 2. Buscar metricas por item para o RANGE COMPLETO de uma vez
Em vez de buscar metricas de cada item para cada dia individualmente (165 items x 30 dias = 4.950 chamadas), buscar metricas de cada item para o **range inteiro de datas faltantes** (165 chamadas total). A API do ML aceita `date_from` e `date_to` no mesmo endpoint.

### 3. Buscar campanhas para o RANGE COMPLETO de uma vez
Mesma logica: 1 chamada de campanhas para todo o range, nao 30 chamadas.

### 4. Salvar cache agregado para o range (nao por dia individual)
Em vez de tentar criar 30 linhas de cache granulares (que falham com rate limit), salvar o **agregado do range** em cache. Quando datas futuras forem solicitadas, apenas os dias novos serao buscados.

### 5. Manter o guarda de confiabilidade
A logica que impede cachear zeros quando ha itens ativos continua, mas agora raramente sera acionada (pois o volume de chamadas cai 30x).

### Resumo do impacto

```text
ANTES (30 dias):
  discoverItems:        30 x 2  =   60 chamadas
  fetchItemMetrics:     30 x 165 = 4.950 chamadas
  fetchCampaigns:       30 x 1  =   30 chamadas
  TOTAL:                          ~5.040 chamadas
  Tempo estimado:                 2-3 minutos (com rate limits)
  Resultado:                      FALHA (429 -> zeros -> nao cacheia)

DEPOIS (30 dias):
  discoverItems:        1 x 2   =    2 chamadas
  fetchItemMetrics:     1 x 165 =  165 chamadas
  fetchCampaigns:       1 x 1   =    1 chamada
  TOTAL:                            168 chamadas
  Tempo estimado:                 5-8 segundos
  Resultado:                      SUCESSO (dados cacheados)
```

### Arquivo afetado

`supabase/functions/ads-period-metrics/index.ts` -- reescrita da logica de busca de dias faltantes (linhas 153-223) e da funcao `fetchDayMetrics` (linhas 430-481). As funcoes auxiliares (`fetchCampaigns`, `discoverItems`, `fetchItemMetricsBatch`, `aggregateFromCache`) permanecem com ajustes minimos.

### O que NAO muda
- Frontend: nenhuma alteracao
- Tipos (`AdsMetricsSummary`): permanecem iguais
- Hook (`useAdsPeriodMetrics`): permanece igual
- Cards KPI (`AdsKpiCards`): permanecem iguais
- O campo `conversions` ja esta na lista de metricas (correcao anterior mantida)

