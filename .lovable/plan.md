

## Diagnóstico: 349 pedidos N/D — causa raiz

### Problema

O backfill encontra apenas **935** shipment IDs únicos, mas existem **4.514** na base. A função reporta "0 shipments missing" porque ela acha que já buscou tudo — mas na verdade nunca recebeu os outros 3.579.

**Causa raiz**: O Supabase tem um limite padrão de **1.000 linhas por query** no servidor (PostgREST). A linha 52 do backfill usa `.limit(5000)`, mas o servidor ignora e retorna apenas 1.000 linhas. Dessas 1.000 linhas, só 935 são shipment IDs únicos.

Resultado: 3.041 shipments (4.514 - 1.473 já cacheados) **nunca são processados**.

O mesmo problema existe na query do frontend (AbcCitiesTab linha 127-132) — busca orders sem paginação, potencialmente perdendo dados.

### Plano de correção

**1. Edge Function `ml-backfill-shipments/index.ts`**

Substituir a query de `.limit(5000)` por paginação via loop `.range()` para buscar TODAS as orders:

```typescript
// Buscar TODOS os shipment_ids com paginação
const allOrderShipments: string[] = [];
const PAGE_SIZE = 1000;
let from = 0;
let hasMore = true;

while (hasMore) {
  const { data, error } = await supabaseAdmin
    .from('meli_orders_cache')
    .select('shipment_id')
    .eq('seller_id', sellerId)
    .not('shipment_id', 'is', null)
    .neq('shipment_id', '')
    .range(from, from + PAGE_SIZE - 1);
  
  if (error || !data || data.length === 0) { hasMore = false; break; }
  data.forEach(o => { if (o.shipment_id) allOrderShipments.push(o.shipment_id); });
  from += PAGE_SIZE;
  if (data.length < PAGE_SIZE) hasMore = false;
}
```

Mesma correção para a query de `orderMap` (linha 96-100) que também usa `.in()` com array grande — dividir em batches de 500.

**2. Frontend `AbcCitiesTab.tsx`**

A query de orders (linha 127) e de shipments (linha 157) também podem bater no limite de 1.000. Aplicar paginação ou usar `fetchAllRows()` se já existir no projeto.

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `supabase/functions/ml-backfill-shipments/index.ts` | Paginar query de orders e batched `.in()` para orderMap |
| `src/components/abc/AbcCitiesTab.tsx` | Paginar queries de orders e shipments |

### Resultado esperado

Após o fix, o backfill vai encontrar todos os 3.041 shipments faltantes e processá-los via self-chaining (200 por execução). O frontend também vai carregar todos os dados corretamente.

