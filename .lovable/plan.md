

## Diagnóstico e Solução: Billing Lento + Formato Novo ML (04/03)

### Problemas Identificados

**1. Performance — Por que o billing está lento:**
- O `resync_single` (Strategy 3) faz uma busca linear em todas as páginas do billing period da API do ML para encontrar UM pedido. Com períodos de milhares de registros, isso gera dezenas de requests HTTP por pedido.
- O `handleReprocessPending` executa Strategy 1 + Strategy 1b + Strategy 2 + Strategy 3 **sequencialmente** para cada pedido. Com 50 pedidos por batch + 200ms delay, um batch pode levar vários minutos.
- O `cost-engine` bulk resync chama `ml-sync-real-costs` como uma **Edge Function HTTP separada** para cada pedido (800ms delay), multiplicando a latência.

**2. Formato novo ML (pós 04/03/2026) — Por que comissão e frete estão zerados:**
- O `ml-sync-billing` (função que alimenta `meli_order_financials_cache`) usa `billingData.seller.charges` com `charge.type` para classificar cobranças. Mas o **novo formato do ML** usa campos diferentes (`charge.name`, `charge.label`, `charge.description`) e labels em português ("Custo por vender no Mercado Livre", etc.).
- O `ml-sync-billing` **NÃO usa o classificador unificado** (`ml-billing-classifier.ts`). Ele tem lógica própria inline que só reconhece `sale_fee`, `commission`, `shipping`, `financing` — termos do formato antigo.
- Resultado: pedidos novos passam pelo `ml-sync-billing`, as charges não são reconhecidas, `cost_sale_fee=0`, `cost_shipping_fee=0` são gravados no `meli_order_financials_cache`. Quando o `cost-engine` roda, encontra zero no financials e mantém zero.

### Plano de Implementação

**Arquivo 1: `supabase/functions/ml-sync-billing/index.ts`** (Correção crítica)
- Importar e usar `classifyBillingCharge` do `_shared/ml-billing-classifier.ts` em vez da lógica inline
- Expandir a leitura de campos da resposta para cobrir o novo formato: `charge.name || charge.label || charge.description || charge.type`
- Isso garante que pedidos pós-04/03 tenham comissão e frete gravados corretamente no `meli_order_financials_cache`

```typescript
// ANTES (inline, só reconhece termos antigos):
const chargeType = (charge.type || '').toLowerCase();
if (chargeType.includes('sale_fee') || chargeType.includes('commission')) { ... }

// DEPOIS (usa classificador unificado):
import { classifyBillingCharge } from '../_shared/ml-billing-classifier.ts';
const label = (charge.name || charge.label || charge.description || charge.type || '').toLowerCase();
const amount = Math.abs(charge.value || charge.amount || 0);
const category = classifyBillingCharge(label);
switch (category) {
  case 'commission': financial.cost_sale_fee += amount; break;
  case 'shipping': financial.cost_shipping_fee += amount; break;
  case 'installments': financial.cost_installment_fee += amount; break;
  case 'adjustments': financial.cost_cancellations += amount; break;
}
```

**Arquivo 2: `supabase/functions/ml-sync-real-costs/index.ts`** (Otimização de performance)
- **Remover Strategy 3** (billing period search) do `handleReprocessPending` — esta estratégia busca pagina por pagina da API de billing periods para encontrar um pedido específico. É extremamente lenta e redundante quando o `ml-sync-billing` já grava os dados corretamente no cache.
- No `handleReprocessPending`, após Strategy 1 + 1b falharem, ir direto para Strategy 2 (billing_details_cache). Se não encontrar, marcar como pending e seguir.
- Manter Strategy 3 **apenas no `resync_single`** (ação manual do usuário para 1 pedido), onde a espera é aceitável.
- Reduzir rate-limit delay de 200ms para 100ms entre pedidos no batch.

**Arquivo 3: `supabase/functions/_shared/ml-billing-classifier.ts`** (Ajuste menor)
- Verificar que o campo `charge.type` bruto da API (ex: `sale_fee_amount`, `marketplace_fee`, `financing_fee`) é coberto pelo classificador — já está, mas adicionar `financing_fee` explicitamente para cobrir edge case.

### Detalhes Técnicos

**Impacto esperado na performance:**
- Remover Strategy 3 do batch: de ~30 requests HTTP por pedido pendente para ~2 requests (orders API + billing_info).
- Um batch de 50 pedidos passa de ~5-10 minutos para ~30-60 segundos.

**Impacto na correção de dados:**
- Pedidos pós-04/03 terão comissão e frete gravados corretamente via `ml-sync-billing`.
- O `cost-engine` encontrará dados reais no `meli_order_financials_cache` e calculará lucro correto.
- Pedidos já gravados com zeros precisarão de um reprocessamento (o botão "Recalcular" existente já faz isso).

### Arquivos modificados
1. `supabase/functions/ml-sync-billing/index.ts` — usar classificador unificado
2. `supabase/functions/ml-sync-real-costs/index.ts` — remover Strategy 3 do batch
3. `supabase/functions/_shared/ml-billing-classifier.ts` — adicionar `financing_fee`

