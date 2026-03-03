

# Diagnóstico: Recalcular falha silenciosamente + Filtros exibem dados iguais

## Causa Raiz Confirmada

Verificação no banco de dados:
- `meli_orders_cache`: **4.397 pedidos pagos** desde 03/03/2025 (importação histórica funcionou)
- `order_cost_breakdown_cache`: **apenas 597 registros** desde 12/01/2026 (nunca recalculou o período completo)

O "Recalcular" **parece funcionar** (retorna 200, toast aparece), mas a função `calculateCosts` **falha silenciosamente** quando processa muitos pedidos porque:

1. **N+1 queries de embalagem**: A função `getPackagingForOrder()` é chamada **individualmente para cada pedido** dentro do loop (linha 810-812). Para 4.000+ pedidos, são 4.000+ queries ao banco, causando timeout da Edge Function (~60s).

2. **Código morto**: Na linha 779, a variável `allProductKeys` é calculada corretamente para preload, mas **nunca é usada** -- o preload de embalagem nunca foi implementado.

3. **Timer fixo de 5 segundos**: O frontend espera apenas 5s antes de atualizar o dashboard. Para 4.000 pedidos, o cálculo leva minutos (quando não dá timeout).

4. **30d = 60d = 365d**: Como o breakdown cache só tem 597 registros (últimos ~50 dias), qualquer filtro acima de 50 dias retorna os mesmos dados.

## Plano de Correção

### 1. Otimizar `calculateCosts` -- Preload de embalagem em bulk (critical fix)
**Arquivo**: `supabase/functions/cost-engine/index.ts`

Usar a variável `allProductKeys` (já computada na linha 779) para fazer UMA ÚNICA query de packaging links + packaging_types. Substituir as chamadas individuais `getPackagingForOrder()` dentro do loop por lookup no Map pré-carregado.

Antes (pseudocódigo):
```
for each order:
  packaging = await getPackagingForOrder(...)  // 1 query per order!
```

Depois:
```
// Preload ALL packaging links for ALL product keys (1 query)
const allLinks = fetchWithBatchedIn(product_packaging_link, allProductKeys)
const allPkgTypes = fetch packaging_types for unique IDs (1 query)
const packagingMap = buildMap(allLinks, allPkgTypes)

for each order:
  packaging = lookupFromMap(packagingMap, orderProductKeys)  // 0 queries
```

### 2. Implementar auto-chaining para cálculos grandes
**Arquivo**: `supabase/functions/cost-engine/index.ts`

Para períodos com mais de 1.000 pedidos, processar em lotes de 500 e auto-encadear via `_internal/calculate-continue`, usando a mesma estratégia do `orders-historical-import`. Persistir progresso em campo da resposta.

### 3. Melhorar feedback no frontend
**Arquivo**: `src/pages/Custos.tsx`

Substituir o `setTimeout(5000)` por polling inteligente: verificar o summary a cada 3 segundos até que `order_count` mude ou 60 segundos se passem. Mostrar indicador de progresso real.

### 4. Corrigir cálculo duplicado de shipping no RPC
**Arquivo**: Migration SQL para `get_cost_summary`

A linha 23 do RPC soma `cost_shipping + shipping_cost_seller` -- esses campos frequentemente contêm o mesmo valor (fallback um do outro), causando **duplicação do custo de frete** no dashboard.

### Arquivos a editar
| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/cost-engine/index.ts` | Preload bulk de packaging + auto-chaining para cálculos grandes |
| `src/pages/Custos.tsx` | Polling inteligente ao invés de timer fixo de 5s |
| Migration SQL | Corrigir soma duplicada de frete no `get_cost_summary` |

