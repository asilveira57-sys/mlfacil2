

## Diagnóstico — 81 Pedidos Travados em "Sem Custo" (ADECONEX.SP)

### Causa Raiz Confirmada: Billing fetch SEM paginação

**Dados do banco:**
- Período `2026-01-01`: 2000 registros em cache (exatamente 2×1000 — fetch truncado)
- Período `2026-02-01`: 2109 registros em cache (incompleto)
- 81 pedidos pendentes (Jan 13-15 + Feb 16-20), todos `order_status: paid`, nenhum cancelado
- **Zero** registros de billing no cache para esses order_ids específicos
- A comissão desses pedidos está em páginas 3+ do billing API, nunca buscadas

**O bug está em dois lugares:**

1. **`costs-nightly-sync` linha 360:** `limit=1000&offset=0` hardcoded — busca apenas a primeira página de billing por período. Seller com alto volume tem 3000+ entries por período.

2. **`resync_single` linha 207:** mesmo problema — `limit=1000&offset=0` sem loop. A busca individual busca 1000 registros por período, não encontra o pedido, e desiste.

3. **`handleReprocessPending`** já tem paginação correta (linhas 604-653), mas tem tempo limitado de 40s que pode não ser suficiente para percorrer todos os períodos com 3000+ entries cada.

---

### Correções

| Arquivo | Alteração |
|---|---|
| `supabase/functions/costs-nightly-sync/index.ts` | Linhas 358-400: Adicionar loop de paginação com `offset` incremental (igual ao `handleReprocessPending`) em vez de `offset=0` fixo |
| `supabase/functions/ml-sync-real-costs/index.ts` | Linhas 205-248: Adicionar paginação ao fetch de billing no `resync_single` — loop com offset até encontrar o pedido ou esgotar páginas |

### Detalhes Técnicos

**costs-nightly-sync — billing fetch paginado:**
```text
for each period:
  offset = 0
  loop:
    fetch /details?limit=1000&offset={offset}
    if empty → break
    upsert records
    offset += results.length
    if results.length < 1000 → break (última página)
    sleep(200ms) // rate limit
```

**resync_single — billing fetch paginado:**
```text
for each period (up to 3):
  offset = 0
  found = false
  loop:
    fetch /details?limit=1000&offset={offset}
    filter for target order_id
    if found → upsert + break
    if results.length < 1000 → break (última página)
    offset += results.length
    sleep(200ms)
  if found → break period loop
```

Essas duas alterações garantem que pedidos em páginas 2+ do billing sejam capturados tanto pelo sync noturno quanto pela ressincronização individual.

