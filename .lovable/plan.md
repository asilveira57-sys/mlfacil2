

## Causa Raiz Confirmada com Evidência

O `ml-sync-real-costs` usa o endpoint **ERRADO** para buscar comissão:

- **Atual (errado):** `GET /orders/{order_id}` → `payments[].marketplace_fee` → retorna **0** para esses 41 pedidos
- **Correto (funciona em outros módulos):** `GET /orders/{order_id}/billing_info` → `seller.charges[]` → retorna sale_fee, shipping, installment

Confirmei chamando a API agora: `resync_single` retorna `fee_ml: 0` porque `marketplace_fee` nos payments é 0 para esses pedidos. Enquanto isso, `ml-sync-billing` e `ml-sync-financial` usam `/billing_info` e extraem corretamente de `seller.charges[]`.

Os 41 pedidos ficam presos porque:
1. `fee_ml` fica 0 → `fee_ml_source` fica "pending" → pedido nunca sai de "Sem Custo"
2. O sistema roda, marca `last_checked_at`, mas nada muda

## Correção

**Arquivo:** `supabase/functions/ml-sync-real-costs/index.ts`

### 1. `handleResyncSingle` (linhas 188-251)
Substituir `GET /orders/{order_id}` por `GET /orders/{order_id}/billing_info`, extraindo:
- `seller.charges[].type` contendo `sale_fee` ou `commission` → `feeML`
- `seller.charges[].type` contendo `shipping` → `shippingCostSeller`
- `seller.charges[].type` contendo `financing`/`installment` → `installmentsCost`
- Valor = `Math.abs(charge.value)`

Exatamente como `ml-sync-billing` faz nas linhas 726-741.

### 2. `handleReprocessPending` (linhas 512-572)
Mesma substituição: trocar `GET /orders/{order_id}` por `GET /orders/{order_id}/billing_info` com a mesma lógica de extração de `seller.charges[]`.

### 3. Tratamento de 401
Adicionar refresh de token (como `ml-sync-financial` faz) caso o billing_info retorne 401.

Nenhuma tabela ou coluna precisa mudar — apenas a fonte de dados da API.

