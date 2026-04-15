

# Corrigir Detecção de NF para Pedidos "Reimprimir"

## Problema encontrado

A venda do DAJUSCEMARA (order `2000015961750872`) tem no banco:
- `invoice_status = 'pendente'` — a invoice_cache não tem essa NF
- `shipment_substatus = 'printed'` — o pedido já foi impresso antes
- `logistic_type = 'xd_drop_off'` — Coleta

A função `orderHasNf()` em `shippingLabelRules.ts` verifica:
1. `invoice_status === 'emitida'` → **falso** (cache sem NF)
2. `shipment_substatus` em `['ready_to_print', 'invoice_issued', 'invoice_validated', 'not_required']` → **falso** (`printed` não está na lista)

Resultado: o sistema bloqueia "Cabeçalho + DANFE" por achar que não tem NF.

## Causa raiz

Um pedido com substatus `printed`, `ready_for_pickup` ou `in_packing_list` **já passou pela validação fiscal do ML** — é impossível chegar nesses estados sem NF emitida. Porém esses substatuses de "reimprimir" não estão na lista de "NF pronta" do `orderHasNf()`.

## Solução

### 1. Adicionar substatuses de reimprimir na detecção de NF
Em `src/lib/shippingLabelRules.ts`, na função `orderHasNf()`, incluir `'printed'`, `'ready_for_pickup'` e `'in_packing_list'` na lista de substatuses que indicam NF pronta.

```typescript
const readySubstatuses = [
  'ready_to_print', 'invoice_issued', 'invoice_validated', 'not_required',
  'printed', 'ready_for_pickup', 'in_packing_list'  // já passou pela validação fiscal
];
```

### O que NÃO muda
- Edge function `ml-generate-labels` (zero alteração)
- Frontend de etiquetas
- Banco de dados
- Lógica de geração de PDF/ZPL
- Outras regras de habilitação

### Impacto
- Pedidos na aba "reimprimir" passam a ter "Cabeçalho + DANFE" habilitado (correto, pois ML já validou)
- Zero risco para pedidos novos na aba "pronta" — a lógica deles não muda
- Arquivo: `src/lib/shippingLabelRules.ts` (1 linha)

