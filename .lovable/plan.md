

## Corrigir bloqueio de impressão de etiquetas Flex sem NF

### Diagnóstico

O problema está na **validação da Edge Function `ml-generate-labels`** (linhas 619-726). O código:

1. Busca os shipments do cache **sem incluir `logistic_type`** na query (linha 621)
2. Verifica se **todos** os envios têm NF emitida (linhas 722-726)
3. Se a NF não existe, rejeita o envio com erro "NF não emitida para este pedido"

Envios Flex (`self_service`) **não precisam de NF** — o Mercado Livre não exige. Porém o código não diferencia e bloqueia igualmente.

### Solução

Duas alterações cirúrgicas na Edge Function:

**1. Incluir `logistic_type` no select do cache** (linha 621)

Mudar de:
```
.select('shipment_id, order_id, label_available')
```
Para:
```
.select('shipment_id, order_id, label_available, logistic_type')
```

**2. Pular validação de NF para envios Flex** (linhas 722-726)

Antes da verificação de invoice, checar se o envio é Flex (`self_service`). Se for Flex, aceitar o envio mesmo sem NF:

```typescript
const invoice = invoiceMap.get(shipment.order_id);
const isFlex = shipment.logistic_type === 'self_service';

// Flex shipments don't require NF — skip invoice check
if (!isFlex && (!invoice || invoice.invoice_status !== 'emitida')) {
  validationErrors.push({ shipment_id, reason: 'NF não emitida para este pedido' });
  continue;
}
```

### Arquivo alterado
| Arquivo | Alteração |
|---|---|
| `supabase/functions/ml-generate-labels/index.ts` | Adicionar `logistic_type` ao select + pular validação de NF para Flex |

### Impacto
- Flex sem NF: passa na validação e gera etiqueta normalmente
- Flex com NF: continua funcionando (NF será incluída no PDF se existir)
- Coleta/outros: mantém a exigência de NF como antes
- Nenhuma alteração de frontend necessária

