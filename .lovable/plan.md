

## Diagnóstico Completo — Sistema de Custos Travado

### Problema 1: Billing sync NUNCA re-executa (causa raiz principal)

**Causa confirmada no banco:**
- ADECONEXVV (66043362): billing_details_cache última busca em **19/01/2026** (40 dias atrás!)
- ADECONEX.SP (1411095727): última busca em **11/02/2026** (17 dias atrás)
- Ambos com `billing_details_sync_state.status = 'done'`

**O bug:** No `costs-nightly-sync` (linha 194), a condição para executar billing sync é:
```
if (!billingState || billingState.status === 'paused' || billingState.status === 'error')
```
Quando status é `'done'`, **pula o billing sync**. Nunca mais busca dados novos. Por isso:
- ADECONEXVV: 0 pedidos com `fee_ml_source='billing'` nos últimos 30 dias → aba Pedidos vazia
- ADECONEX.SP: último pedido com billing é de 11/02 → pedidos após essa data ficam pending

**Correção:** Alterar a condição para SEMPRE executar billing sync (scope `recent`) quando `status === 'done'`, resetando o estado para buscar os períodos mais recentes.

---

### Problema 2: resync_single não busca billing via API

**Causa:** `handleResyncSingle` lê apenas do cache local (`meli_billing_details_cache`). Se o billing não foi sincronizado, não encontra nada → retorna `fee_ml_source: 'pending'` e aparenta sucesso ("resincronizado") sem trazer dados.

**Confirmado:** Pedido `2000015175713528` após resync mostra `fee_ml_source: pending`, `cost_fees: 0`, `commission_cost: 0`.

**Correção:** Antes de ler o cache, `resync_single` deve chamar a API de billing do ML diretamente para aquele pedido/período específico e atualizar o cache.

---

### Problema 3: Seletor de conta duplicado

**Causa:** A página `Custos.tsx` renderiza um `<Select>` próprio no `headerContent` (linhas 114-126) com a lista de contas. Simultaneamente, o layout global já renderiza o `AccountSwitcher` no header. Resultado: dois seletores lado a lado.

**Correção:** Remover o `<Select>` de contas do `headerContent` em `Custos.tsx`, mantendo apenas o botão "Recalcular".

---

### Problema 4: backfill no nightly sync não resolve installments (bug residual)

No `costs-nightly-sync`, a função `processBackfill` (linha 498) calcula `costFees = feeML + installmentsCost + adjustments`, incluindo parcelamento no custo — contrário à correção recente.

**Correção:** Alinhar com as correções já feitas: `costFees = feeML + adjustments` (sem installments).

---

### Resumo de alterações

| Arquivo | Alteração |
|---|---|
| `supabase/functions/costs-nightly-sync/index.ts` | L194: incluir `status === 'done'` para re-executar billing sync; L498: excluir installments de costFees |
| `supabase/functions/ml-sync-real-costs/index.ts` | `handleResyncSingle`: buscar billing via API do ML antes de ler cache local |
| `src/pages/Custos.tsx` | Remover `<Select>` de conta do headerContent, manter apenas botão Recalcular |

