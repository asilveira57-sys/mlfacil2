

# Diagnóstico: calculateCosts timeout silencioso em 4398 pedidos

## Causa Raiz Confirmada

Dados no banco:
- `meli_orders_cache`: **4.398 pedidos pagos** (2025-03-03 a 2026-03-03)
- `order_cost_breakdown_cache`: **598 registros** (somente Jan-Mar 2026)
- Último cálculo completado: **403 pedidos** (provavelmente período de 30d)

O `calculateCosts` com `period_days=365` tenta processar 4.398 pedidos numa única invocação:
- 9 batches para buscar items (fetchWithBatchedIn)
- 9 batches para buscar financials
- 9 batches para buscar breakdowns existentes
- **44 batch upserts** para salvar breakdowns (100 por batch)
- **44 batch inserts** para logs
- Mais o `updateProductAggregates`

Total: ~120+ operações sequenciais ao banco. A Edge Function atinge o timeout (~60-150s) e **morre silenciosamente** no meio dos upserts. Resultado: apenas parte dos breakdowns é salva.

## Plano de Correção

### 1. Auto-chaining no calculateCosts (fix principal)
**Arquivo**: `supabase/functions/cost-engine/index.ts`

Modificar `calculateCosts` para processar no máximo **500 pedidos por invocação**:
- Aceitar parâmetro `offset` (default 0)
- Buscar orders com `.range(offset, offset+499)` em vez de `fetchAllRows`
- Após processar e salvar o batch, fazer self-call via `_internal/calculate-batch` com `offset + 500`
- Quando não houver mais pedidos, chamar `updateProductAggregates`

Fluxo:
```text
calculate (offset=0)
  → processa orders 0-499, upsert, self-call
_internal/calculate-batch (offset=500)
  → processa orders 500-999, upsert, self-call
_internal/calculate-batch (offset=1000)
  ...continua até acabar...
_internal/calculate-batch (offset=4000)
  → processa orders 4000-4397, upsert, updateAggregates, FIM
```

### 2. Dados compartilhados entre batches
O preload de packaging, tax config, e product costs são feitos **uma vez** no primeiro batch e passados via body para os batches seguintes (são poucos KB). Ou, mais simples, cada batch refaz esses preloads (são apenas 2-3 queries rápidas e leves).

### 3. Endpoint _internal/calculate-batch
Novo case no switch de `_internal/`:
- Recebe: `seller_id, user_id, period_days, offset`
- Autenticado via `x-internal-key` (service role)
- Chama a mesma lógica de processamento com offset

### Arquivos a editar
| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/cost-engine/index.ts` | Auto-chaining no calculateCosts com batches de 500 |

O frontend (`Custos.tsx`) já tem polling inteligente implementado, não precisa mudar.

