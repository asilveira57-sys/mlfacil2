

## Diagnóstico Final — 41 Pedidos Travados em "Sem Custo"

### Causa Raiz: API errada para buscar custos individuais

O `resync_single` e o `handleReprocessPending` buscam dados de custo via **billing mensal** (`/billing/integration/periods/key/.../details`) — uma API que retorna 3.000+ registros por período, exigindo paginação massiva. Isso causa:

1. **Rate limit 429** — os logs mostram erros 429 em praticamente todos os períodos. O batch esgota o rate limit, e o individual também falha.
2. **Dados nunca encontrados** — o cache de billing para Feb/2026 tem apenas 2.109 registros (truncado). Os 41 pedidos (Feb 16-20) estão nas páginas que nunca foram buscadas. E ao buscar via API, dá 429.
3. **Loop infinito**: o batch processa 50 pedidos, não encontra billing (429), marca `last_checked_at` mas mantém `fee_ml_source: 'pending'`, e na próxima execução re-processa os mesmos 41.

**Enquanto isso**, o sistema já tem uma solução que funciona: a `ml-sync-financial` usa `GET /orders/{order_id}/billing_info` — **uma chamada por pedido**, retorna comissão, frete e parcelamento diretamente. É a API correta para resync individual e batch.

### Correção

| Arquivo | Alteração |
|---|---|
| `supabase/functions/ml-sync-real-costs/index.ts` | `resync_single`: substituir o loop de paginação billing por uma chamada a `/orders/{order_id}/billing_info`. Extrair `seller.charges[]` com `sale_fee`, `shipping`, `installment`. Cachear em `meli_order_financials_cache`. |
| `supabase/functions/ml-sync-real-costs/index.ts` | `handleReprocessPending`: substituir o fetch massivo de billing periods por chamadas individuais a `/orders/{order_id}/billing_info` para cada pedido pendente (50 por lote). Adicionar retry com backoff em 429. Remover a fase de fetch de billing periods inteira. |

### Detalhes Técnicos

**`resync_single` — nova lógica:**
```text
1. GET /orders/{order_id}/billing_info
2. Extrair seller.charges[]:
   - type includes 'sale_fee' → feeML
   - type includes 'shipping' → shippingCostSeller
   - type includes 'financing'/'installment' → installmentsCost
3. Se billing_info retorna dados → fee_ml_source = 'billing'
4. Cachear em meli_order_financials_cache
5. Fallback: manter shipment API para frete (/shipments/{id}/costs)
6. Se billing_info retorna 429 → retry 1x após 1s
```

**`handleReprocessPending` — nova lógica:**
```text
1. Query 50 pedidos pendentes (como hoje)
2. Para CADA pedido:
   a. GET /orders/{order_id}/billing_info
   b. Se 429 → aguardar 2s e retry (max 2 tentativas)
   c. Extrair charges como acima
   d. Se sem dados billing → GET /shipments/{id}/costs
   e. Montar row com fee_ml_source correto
3. Rate limit: 200ms entre cada pedido
4. Remover inteiramente o bloco de fetch de billing periods (linhas 599-680)
```

Essa mudança elimina:
- A necessidade de paginar 3.000+ registros de billing
- Os erros 429 em cascata (1 chamada por pedido vs 4+ chamadas de paginação por período)
- O cache truncado como ponto de falha

