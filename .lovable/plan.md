

# Correção: Vendas de Carrinho (Pack) — Itens Duplicados e Cabeçalho Incompleto

## Problema

Quando um comprador faz uma venda de carrinho (ex: 2 produtos no mesmo pedido), o Mercado Livre cria **dois `order_id`** com um único `shipment_id` e `pack_id`. O sistema trata cada `order_id` separadamente:

1. **Na tabela**: O dedup do RPC mantém apenas 1 `order_id`. A busca de itens usa somente esse `order_id`, mostrando apenas 1 produto do carrinho.
2. **No cabeçalho**: O mapa `shipmentToOrderId` armazena apenas 1 `order_id` por `shipment_id`. O cabeçalho lista apenas os itens de 1 pedido, ignorando os demais.
3. **Pack_id ausente**: O RPC não retorna `pack_id`, impedindo a UI de agrupar corretamente.

## Correção em 3 Frentes

### 1. RPC `get_shipping_orders` — Retornar `pack_id`

Adicionar `o.pack_id` à query e ao JSON de saída do RPC, permitindo que a UI identifique vendas de carrinho.

### 2. Frontend — Buscar itens por TODOS os `order_id` do mesmo `shipment_id`

Em `useShippingLabels.ts`, após obter os pedidos deduplicados:
- Para cada pedido com `pack_id`, buscar todos os `order_id` que compartilham o mesmo `shipment_id`
- Buscar itens de TODOS esses `order_id`
- Agrupar todos os itens sob o `order_id` principal (deduplicado)

```text
Antes:  orderItems.get("2000015905836748") → [Etiqueta Redonda]
Depois: orderItems.get("2000015905836748") → [Etiqueta Redonda, Ribbon Dourado]
```

### 3. Edge Function — Cabeçalho com todos os itens do pack

Em `ml-generate-labels/index.ts`:
- Trocar `shipmentToOrderId` (1:1) por `shipmentToOrderIds` (1:N)
- Buscar TODOS os `order_id` do mesmo `shipment_id` via `meli_orders_cache`
- Buscar itens de TODOS os `order_id` do pack
- Montar cabeçalho com a lista completa de produtos

## Arquivos afetados

- **Nova migration SQL** — `get_shipping_orders`: adicionar `pack_id` ao output
- **`src/hooks/useShippingLabels.ts`** — buscar itens de todos os order_ids do pack
- **`src/hooks/useShippingLabels.ts`** — adicionar `pack_id` ao tipo `ShippingOrder`
- **`supabase/functions/ml-generate-labels/index.ts`** — usar mapeamento 1:N para shipment→orders, buscar todos os itens

## Resultado

- Tabela: Carrinho com 2 produtos mostra os 2 itens na mesma linha
- Cabeçalho: Lista completa de todos os produtos do carrinho
- Uma única etiqueta por envio, independente de quantos order_ids o pack tem

