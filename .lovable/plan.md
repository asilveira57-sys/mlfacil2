
# Corrigir Filtros de Período e Status das Etiquetas de Envio

## Status: ✅ CONCLUÍDO

### Mudanças aplicadas:

**1. RPC `get_shipping_orders` (2 migrações)**
- Removida restrição de `shipment_substatus` e `logistic_type` do filtro `today_dispatch`
- Agora é um filtro PURO de data: mostra envios com `estimated_handling_limit <= hoje` OU fallback para pedidos criados hoje com envio pendente
- Removida função duplicada com assinatura antiga

**2. Hook `useShippingLabels.ts`**
- `case 'all'`: removido limite de 30 dias → retorna `{ dateFrom: null, dateTo: null }` (busca tudo)
- `case 'today'`: mantém retornando null (RPC controla via `today_dispatch`)

### Resultado esperado:
- **Todos**: mostra todos os pedidos sem limite de data
- **Envios de hoje**: filtra por prazo de despacho (igual ao ML)
- **7d/15d/30d**: filtram por `created_at_meli` no período
- **Reimprimir**: conta corretamente os envios com substatus `printed`
- **Aguardando NF**: conta corretamente os envios com substatus `invoice_pending`
- **Pronta**: conta corretamente os envios com substatus `ready_to_print`
