

# Corrigir classificação de status: ready_for_pickup/in_packing_list → Reimprimir

## Problema
O RPC `get_shipping_orders` classifica `ready_for_pickup` e `in_packing_list` como `pronta` (Para imprimir). Isso está errado: no fluxo do ML para cross_docking, esses substatuses vêm DEPOIS da impressão da etiqueta. A etiqueta já foi gerada e o envio está em fase de coleta. Qualquer impressão posterior é reimprimir.

**Dados reais do GUI_GOODMAN:**
- 19 pedidos (`ready_for_pickup` + `in_packing_list`) → aparecem como "Para imprimir 19"
- 0 pedidos `printed` → único status mapeado para "Reimprimir"
- Resultado: "Reimprimir 0" quando o usuário espera ver 19

## Mapeamento correto
| Substatus ML | Status no sistema | Motivo |
|---|---|---|
| `ready_to_print` + label_available | `pronta` | Primeira impressão, etiqueta acabou de ficar disponível |
| `ready_for_pickup` | `reimprimir` | Etiqueta já gerada, coleta agendada |
| `in_packing_list` | `reimprimir` | Etiqueta já gerada, em preparação para coleta |
| `printed` | `reimprimir` | Etiqueta já impressa (como já está) |
| `invoice_pending` | `aguardando_nf` | Sem mudança |
| `in_hub`, `dropped_off` | `enviado` | Sem mudança |

## Correção
**Nova migration SQL** — Alterar o CASE do `final_status` no RPC `get_shipping_orders`:

```sql
-- DE:
WHEN s.shipment_substatus IN ('ready_for_pickup', 'in_packing_list') 
     AND COALESCE(s.label_available, false) THEN 'pronta'

-- PARA:
WHEN s.shipment_substatus IN ('ready_for_pickup', 'in_packing_list') THEN 'reimprimir'
```

E igualmente no bloco `selectable`:
```sql
-- Manter selectable=true para reimprimir (ready_for_pickup, in_packing_list, printed)
WHEN s.shipment_substatus IN ('printed', 'ready_for_pickup', 'in_packing_list') THEN true
```

## Arquivo afetado
- **Nova migration SQL** — recriar RPC `get_shipping_orders` com mapeamento corrigido

## Resultado
- GUI_GOODMAN verá "Para imprimir 0, Reimprimir 19" — correto e alinhado com ML
- Pedidos `ready_to_print` continuam como "Para imprimir" (primeira vez)
- Pedidos pós-impressão ficam em "Reimprimir" como o usuário espera

