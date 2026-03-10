

## Diagnóstico

Dois problemas distintos:

### 1. Página de detalhe (`AdTimelineDetail.tsx`) sem thumb/título
O hook `useAdTimelineItemDetail` (linha 198-227 de `useAdTimeline.ts`) só busca em `meli_listings_cache`. Se o item não está lá, não tem fallback — diferente da lista que já usa o RPC `get_order_items_enrichment`.

### 2. Status ML e Estoque vazios em ambas as views
Esses campos (`status`, `available_quantity`) **não existem** em `meli_order_items_cache` (que só tem dados de pedidos). Eles só existem na API do ML. A `meli_listings_cache` está vazia para esses itens, então não tem de onde puxar.

A única solução real: buscar na API do ML via multi-get (`/items?ids=MLB1,MLB2,...`) e gravar em `meli_listings_cache`.

## Plano de correção

### 1. Nova edge function `ad-timeline-enrich-items`
- Recebe lista de `item_ids` + `ml_account_id`
- Usa multi-get autenticado (`/items?ids=...&attributes=id,title,thumbnail,status,available_quantity,price,variations`) em batches de 20
- Faz upsert em `meli_listings_cache` com: `item_id`, `title`, `thumbnail`, `status`, `available_quantity`, `price`, `sku`
- Retorna os dados enriquecidos

### 2. Hook `useAdTimelineItemDetail` — adicionar fallback
- Após falhar em `meli_listings_cache`, chamar o RPC `get_order_items_enrichment` para thumb/título (mesmo padrão da lista)
- Disparar a edge function `ad-timeline-enrich-items` em background para buscar status/stock da API do ML e atualizar o cache

### 3. Hook `useAdTimelineStats` — enriquecer status/stock
- Após o enriquecimento existente (listing cache + RPC), identificar itens que ainda têm `status: null`
- Disparar a edge function `ad-timeline-enrich-items` em background com esses item_ids
- Ao retornar, invalidar a query para que os dados apareçam no próximo render

### 4. Trigger automático na página do Radar
- Na primeira carga, se houver itens sem status, disparar o enriquecimento em background (uma vez por sessão)
- Isso popula `meli_listings_cache` progressivamente, resolvendo o problema permanentemente

### Arquivos alterados
- **Novo**: `supabase/functions/ad-timeline-enrich-items/index.ts`
- **Editar**: `src/hooks/useAdTimeline.ts` — fallback no detalhe + trigger de enriquecimento
- **Editar**: `src/pages/AdTimelineDetail.tsx` — usar dados enriquecidos

### Resultado esperado
- Lista: thumb + título (já funciona) + status ML + estoque (via enriquecimento background)
- Detalhe: thumb + título + status + estoque (via fallback + enriquecimento)
- Dados ficam em cache (`meli_listings_cache`), então na segunda abertura tudo aparece instantaneamente

