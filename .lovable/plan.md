

# Pedidos antigos com etiqueta pendente ficam ocultos pelo filtro de data

## Diagnóstico

O ML mostra 9 etiquetas para imprimir (Coleta | Amanhã). O sistema mostra 6. Os dados no banco confirmam que existem **9 envios `ready_to_print`** com `label_available=true` para GUI_GOODMAN.

A diferença: **3 pedidos foram criados há mais de 7 dias** (29/mar e 31/mar), e a usuária está com o filtro "7 dias" selecionado. O filtro usa `created_at_meli` (data da venda), não a data de despacho. Como esses pedidos ainda não foram despachados, o ML os mostra normalmente, mas o sistema os esconde.

| Shipment | Criado em | Status | Visível em "7 dias"? |
|---|---|---|---|
| 46748206631 | 29/mar | ready_to_print | Não (11 dias) |
| 46747695422 | 29/mar | ready_to_print | Não (11 dias) |
| 46761648584 | 31/mar | ready_to_print | Não (9 dias) |
| 6 outros | 6-9/abr | ready_to_print | Sim |

## Correção

Alterar o RPC `get_shipping_orders` para **sempre incluir pedidos em status acionável** (pronta, aguardando_nf, reimprimir) independentemente do filtro de data. Pedidos que precisam de ação do vendedor nunca devem ser escondidos por um filtro temporal.

### Migration SQL
No bloco `WHERE` do `base_orders`, mudar a lógica de data para:
```sql
AND (
  CASE
    WHEN p_period_type = 'today_dispatch' THEN
      -- lógica existente de handling_limit (sem mudança)
      ...
    ELSE
      -- Filtro de data aplica normalmente, MAS pedidos acionáveis
      -- (ready_to_print, printed, ready_for_pickup, in_packing_list, invoice_pending)
      -- são SEMPRE incluídos, independente da data de criação
      (
        (p_date_from IS NULL OR o.created_at_meli >= p_date_from)
        AND (p_date_to IS NULL OR o.created_at_meli <= p_date_to)
      )
      OR (
        s.shipment_status IN ('ready_to_ship', 'pending', 'handling')
        AND s.logistic_type IS DISTINCT FROM 'fulfillment'
        AND s.shipment_substatus IN ('ready_to_print', 'printed', 'ready_for_pickup', 'in_packing_list', 'invoice_pending')
      )
  END
)
```

Isso garante que qualquer pedido pendente de ação (imprimir, reimprimir, NF) aparece nos contadores, mesmo que a venda seja de 2 semanas atrás.

## Arquivo afetado
- **Nova migration SQL** — atualizar RPC `get_shipping_orders`

## Resultado
- "7 dias" mostra 9 para imprimir (não 6), porque inclui pedidos antigos ainda pendentes
- Contadores batem com o ML
- Pedidos já enviados/entregues continuam filtrados normalmente por data

