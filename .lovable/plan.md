
# Correcao de Performance: Campanhas com Cache Instantaneo

## Problema Raiz

Existem **dois problemas** causando a lentidao na aba Campanhas:

1. **Edge function desnecessaria**: Toda vez que voce muda o periodo (7d, 14d, 30d...), o `useAdsPeriodMetrics` chama a edge function `ads-period-metrics` que faz requests para a API do Mercado Livre. Essa chamada roda **sempre**, mesmo quando voce esta na aba Campanhas e nao precisa dos dados do Dashboard.

2. **Cache vazio na tabela de campanhas**: O `AdsCampaignsTable` busca dados em `ads_period_cache` com `range_key IS NULL` (linhas diarias), mas essa tabela tem **0 registros diarios** -- entao nunca tem dados para derivar. A edge function ja retorna os dados de campanha (`campaigns` array), mas o hook `useAdsPeriodMetrics` simplesmente **descarta** esses dados.

## Solucao

Reaproveitar os dados de campanha que a edge function JA retorna, passando-os diretamente para a tabela de campanhas. Zero chamadas extras, zero queries adicionais.

```text
ANTES (lento):
  Muda periodo
    -> useAdsPeriodMetrics chama edge function (3-10s)
    -> AdsCampaignsTable busca ads_period_cache (0 rows, inutil)
    -> Tela fica travada

DEPOIS (instantaneo):
  Muda periodo
    -> useAdsPeriodMetrics chama edge function 1x (com cache local para derivar)
    -> Edge function retorna campaigns[] junto com summary
    -> campaigns[] e passado diretamente para AdsCampaignsTable
    -> Troca de periodo usa cache local = instantaneo
```

## Mudancas

### 1. `src/hooks/useAdsPeriodMetrics.ts`
- Extrair e cachear o array `campaigns` retornado pela edge function (campo `data.campaigns`)
- Exportar `campaignsMetrics` como parte do retorno do hook
- Na funcao `deriveFromDaily`, tambem derivar campanhas proporcionalmente (ou manter do cache pai)

### 2. `src/pages/Publicidade.tsx`
- Pegar `campaignsMetrics` do retorno de `useAdsPeriodMetrics`
- Passar para `AdsCampaignsTable` via nova prop `precomputedMetrics`

### 3. `src/components/ads/AdsCampaignsTable.tsx`
- Adicionar prop `precomputedMetrics` (opcional)
- Se `precomputedMetrics` estiver presente, usar diretamente em `getCampaignMetrics`
- **Remover** toda a logica de `ensureCache`, `cacheRef`, `aggregateFromCache`, `DailyCampaignRow`, `CampaignCacheEntry` e o `useEffect` que busca `ads_period_cache`
- Eliminar o estado `periodLoading` e `periodMetrics` internos (dados vem de cima)
- Resultado: componente fica puro, sem queries proprias, instantaneo

### Formato dos dados de campanha da edge function

A edge function ja retorna por campanha:
```typescript
{
  ml_campaign_id: string,
  name: string,
  spent: number,
  revenue: number,
  clicks: number,
  impressions: number,
  conversions: number
}
```

Isso e exatamente o que `getCampaignMetrics` precisa para calcular CPC, ACOS, TACOS e ROAS.

## Resultado Esperado

- Primeira carga: 1 unica chamada edge function (igual hoje)
- Trocar de 30d para 7d/14d/60d: **instantaneo** (cache local do `useAdsPeriodMetrics` ja faz isso)
- Zero queries extras na aba Campanhas
- Zero spinning/loading ao trocar periodo

## Arquivos Modificados

| Arquivo | Acao |
|---------|------|
| `src/hooks/useAdsPeriodMetrics.ts` | Extrair e cachear `campaigns` da resposta da edge function |
| `src/pages/Publicidade.tsx` | Passar `campaignsMetrics` para `AdsCampaignsTable` |
| `src/components/ads/AdsCampaignsTable.tsx` | Usar `precomputedMetrics`, remover fetch proprio de `ads_period_cache` |
