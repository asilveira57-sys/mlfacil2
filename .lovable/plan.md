

# Cache Persistente e Abertura Instantanea do Modulo ADS

## Problema Atual

Toda vez que o usuario entra em `/publicidade`, **6 hooks disparam queries simultaneas** ao banco e a Edge Function `ads-period-metrics` (que chama a API do ML). Mesmo com cache no banco (`ads_period_cache`), a Edge Function leva 3-8 segundos por causa de:

1. **Autenticacao + token refresh** a cada chamada
2. **Queries ao banco** para verificar cache, buscar orders, etc.
3. **Nenhum cache no frontend** entre navegacoes -- os hooks usam `useState` com `useEffect`, perdendo tudo ao sair da pagina
4. **6 hooks independentes** (`useAdsCampaigns`, `useAdsDailyMetrics`, `useAdsAlerts`, `useEnrichedAdsItems`, `useAdsSyncState`, `useAdsPeriodMetrics`) todos fazendo fetch ao montar

## Solucao: Cache Persistente em 3 Camadas

```text
Camada 1: Memory Cache (useRef/Map)    -- 0ms, dura enquanto app aberta
Camada 2: ads_period_cache (banco)     -- ~200ms, TTL 1h (hoje) / 24h (historico)
Camada 3: ML API (fetch real)          -- 3-8s, so na madrugada ou cache miss
```

### Parte A: Hook Unificado com Cache Persistente (Frontend)

**Arquivo novo**: `src/hooks/useAdsDataCache.ts`

- Cache em `Map` global (fora do React, persiste entre navegacoes de tabs)
- Chaves: `{sellerId}:{period}:{tab}` (ex: `66043362:30d:dashboard`)
- TTL: 15 minutos para dados do periodo, 5 minutos para campanhas/produtos
- Ao entrar no ADS, renderiza dados do cache **imediatamente** (0ms) e dispara refresh em background
- Pattern: **stale-while-revalidate**

Hooks afetados:
- `useAdsCampaigns` -- leitura do banco, adicionar cache em memoria
- `useAdsPeriodMetrics` -- ja tem `cacheRef` mas e um `useRef` que morre ao desmontar; migrar para `Map` global
- `useEnrichedAdsItems` -- depende de `useAdsItems`, adicionar cache
- `useAdsDailyMetrics` -- adicionar cache
- `useAdsAlerts` -- adicionar cache (TTL curto: 2min)

### Parte B: Prefetch ao Entrar no Modulo (Frontend)

**Arquivo modificado**: `src/pages/Publicidade.tsx`

- Ao montar a pagina, disparar prefetch dos 3 tabs (Dashboard, Campanhas, Produtos) em paralelo
- Usar o cache global para que ao clicar em outra tab, os dados ja estejam prontos
- Mostrar skeleton apenas na primeira vez (sem cache); depois, mostrar dados antigos + indicador de "atualizando"

### Parte C: Background Nightly Sync para ADS (Backend)

**Arquivo novo**: `supabase/functions/ads-nightly-cache/index.ts`

Edge Function que roda na madrugada (via cron ou scheduler existente):
- Para cada conta ativa com ADS, pre-calcula e salva no `ads_period_cache` os periodos padrao (7d, 14d, 30d, 60d, 90d)
- Inclui tratamento de rate limit (retry com backoff exponencial, ja existente no `fetchWithRetry`)
- Salva com `range_key` para que o `ads-period-metrics` encontre cache quente ao ser chamado

### Parte D: Webhook de Invalidacao (Backend)

**Arquivo modificado**: `supabase/functions/ml-worker-process/index.ts`

- Quando o worker processa webhooks de tipo `items` ou `orders`, invalidar o cache ADS do seller afetado
- Inserir flag `ads_cache_stale = true` no `ads_sync_state` para que o frontend saiba que precisa atualizar
- O frontend detecta o flag via polling leve (a cada 60s) e faz refresh silencioso

---

## Detalhamento Tecnico

### 1. Cache Global em Memoria (`useAdsDataCache.ts`)

```text
const adsMemoryCache = new Map<string, {data, cachedAt, ttl}>()

Funcoes exportadas:
- getAdsCache(key) -> data | null
- setAdsCache(key, data, ttl)
- clearAdsCacheForSeller(sellerId)
```

### 2. Refatoracao do `useAdsPeriodMetrics.ts`

- Substituir `cacheRef = useRef(new Map())` por cache global
- Adicionar leitura do `ads_period_cache` do banco como fallback antes de chamar a Edge Function
- Pattern: memoria -> banco -> Edge Function -> ML API

### 3. Nova Edge Function `ads-nightly-cache`

```text
Para cada seller ativo:
  Para cada periodo [7d, 14d, 30d, 60d, 90d]:
    1. Calcular date_from/date_to
    2. Buscar metricas da ML API (com rate limit handling)
    3. Upsert em ads_period_cache com range_key
    4. Sleep entre sellers para respeitar rate limits
```

### 4. Invalidacao via Worker

No `ml-worker-process`, apos processar `orders_v2` ou `items`:
```text
UPDATE ads_sync_state SET cache_stale_at = now() WHERE seller_id = X
```

O frontend verifica `cache_stale_at > last_local_refresh` e faz refresh silencioso.

---

## Resultado Esperado

| Cenario | Antes | Depois |
|---------|-------|--------|
| Primeira abertura do dia | 5-8s (ML API) | 200ms (banco, pre-cached pela madrugada) |
| Trocar tab (Dashboard -> Campanhas) | 3-5s (refetch) | 0ms (cache em memoria) |
| Voltar ao ADS apos navegar outro modulo | 5-8s | 0ms (cache em memoria, TTL 15min) |
| Dados de ontem | 5-8s | 0ms (cache permanente, nunca muda) |

## Arquivos a Criar/Modificar

| Arquivo | Acao |
|---------|------|
| `src/hooks/useAdsDataCache.ts` | **Criar** - Cache global em memoria |
| `src/hooks/useAdsPeriodMetrics.ts` | **Modificar** - Usar cache global + leitura do banco |
| `src/hooks/useAds.ts` | **Modificar** - Adicionar cache em memoria nos hooks |
| `src/pages/Publicidade.tsx` | **Modificar** - Prefetch paralelo + stale-while-revalidate |
| `supabase/functions/ads-nightly-cache/index.ts` | **Criar** - Sync noturno de cache |
| `supabase/functions/ml-worker-process/index.ts` | **Modificar** - Flag de invalidacao |

