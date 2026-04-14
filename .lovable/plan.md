

## Correção definitiva das regras de impressão de etiquetas

### Problema raiz

A função `orderHasNf()` em `shippingLabelRules.ts` só verifica `invoice_status === 'emitida'`, mas o RPC `get_shipping_orders` classifica pedidos como "pronta" usando TAMBÉM sinais do marketplace (`shipment_substatus` como `ready_to_print`, `invoice_issued`, `invoice_validated`). Resultado: pedido aparece como "pronta" na lista mas o botão "Cabeçalho + DANFE" fica bloqueado porque o cache de NF não atualizou.

Além disso, para Flex, a opção "Cabeçalho + DANFE" nunca deveria bloquear — deve cair para header-only quando não houver DANFE.

### Regras de negócio confirmadas

```text
COLETA:
  Padrão ML         → sempre (etiqueta + DANFE se existir)
  Só a Etiqueta     → sempre (etiqueta com cabeçalho, ignora DANFE)
  Cabeçalho + DANFE → só com DANFE pronta
  OBS: se está na aba "pronta", a DANFE foi emitida

FLEX:
  Padrão ML         → sempre (etiqueta + DANFE se existir)
  Só a Etiqueta     → sempre (etiqueta com cabeçalho, ignora DANFE)
  Cabeçalho + DANFE → sempre; se não houver DANFE, sai só etiqueta/cabeçalho

FULL:
  Não seleciona, não imprime

MISTO (Coleta + Flex):
  Cada envio segue sua própria regra sem travar o lote
```

### Plano de implementação

**1. `src/lib/shippingLabelRules.ts`** — Reescrever `orderHasNf` e `computeSelectionCapabilities`

- `orderHasNf`: considerar NF pronta quando `invoice_status === 'emitida'` OU `shipment_substatus` in (`ready_to_print`, `invoice_issued`, `invoice_validated`, `not_required`)
- `computeSelectionCapabilities`:
  - `canStandardPdf`: sempre habilitado (exceto Full)
  - `canNoNfPdf`: sempre habilitado (exceto Full)
  - `canHeaderPdf`: bloqueado apenas se houver pedido Coleta sem DANFE pronta. Flex nunca bloqueia.
- Remover `getReprintLayout` com auto-roteamento; substituir por função que retorna as 3 opções disponíveis para cada pedido

**2. `src/components/shipping/BulkActionsBar.tsx`** — Nenhuma mudança de labels necessária (já estão corretos: Padrão ML, Cabeçalho sem DANFE, Cabeçalho + DANFE). Apenas garantir que `canHeaderPdf` usa a nova regra.

**3. `src/components/shipping/OrderDetailsDrawer.tsx`** — Trocar botão único de PDF por 3 botões explícitos:
- Padrão ML
- Só a Etiqueta (cabeçalho sem DANFE)
- Cabeçalho + DANFE (desabilitado apenas para Coleta sem NF)

**4. `supabase/functions/ml-generate-labels/index.ts`** — Ajustar validação:
- Para Flex com layout `mlfacil_100x175_header`: se não houver DANFE, tratar como `skipDanfe = true` em vez de rejeitar o envio
- Para Coleta: manter bloqueio de `mlfacil_100x175_header` sem NF (consistente com frontend)
- Full: continuar bloqueando

**5. `src/pages/ShippingLabels.tsx`** — Ajustar `handleReprintLabel` para aceitar o layout como parâmetro em vez de auto-calcular

### Detalhe técnico: `orderHasNf` corrigido

```typescript
function orderHasNf(order: ShippingOrder): boolean {
  if (order.invoice_status === 'emitida') return true;
  const readySubstatuses = ['ready_to_print', 'invoice_issued', 'invoice_validated', 'not_required'];
  return readySubstatuses.includes(order.shipment_substatus || '');
}
```

### Detalhe técnico: Flex fallback no backend

No loop de validação do edge function, em vez de:
```typescript
if (nfRequired && !hasInvoice) { validationErrors.push(...); continue; }
```

Será:
```typescript
if (layout === 'mlfacil_100x175_header' && !hasInvoice) {
  if (isFlex) {
    // Flex fallback: allow but mark for skipDanfe
    flexFallbackShipments.add(shipment_id);
  } else {
    validationErrors.push({ shipment_id, reason: 'NF não emitida' });
    continue;
  }
}
```

E na geração do PDF, usar `skipDanfe` por envio quando o shipment está no set de fallback.

### Arquivos alterados
- `src/lib/shippingLabelRules.ts`
- `src/components/shipping/OrderDetailsDrawer.tsx`
- `src/pages/ShippingLabels.tsx`
- `supabase/functions/ml-generate-labels/index.ts`

