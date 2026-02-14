

# Sincronizacao em Tempo Real de Vendas e Status de Envio

## Problema

Quando o seller emite a nota fiscal no Mercado Livre, o status muda de "Aguardando NF" para "Para Imprimir", mas o sistema nao reflete essa mudanca em tempo real. Existem duas falhas:

1. **Vendas novas nao sao cacheadas via webhook**: O `processOrderEvent` atual so processa automacao de boas-vindas. Ele NAO salva o pedido na `meli_orders_cache`. Vendas novas so aparecem quando o job `orders-hourly-sync` roda (a cada hora).

2. **Mudancas de status de envio**: O `processShipmentEvent` ja atualiza `meli_shipments_cache` corretamente, mas o `processOrderEvent` nao atualiza o status do pedido na cache, entao o JOIN da RPC pode mostrar dados desatualizados.

## Solucao

### Parte 1: Webhook de pedidos salva na cache (processOrderEvent)

Modificar `processOrderEvent` em `ml-worker-process/index.ts` para **tambem** fazer upsert do pedido na `meli_orders_cache` quando receber um webhook de `orders_v2`. Isso faz com que vendas novas aparecam imediatamente no sistema.

A logica sera adicionada ANTES da verificacao de automacao existente:
- Buscar dados do pedido na API do ML (ja faz isso)
- Upsert em `meli_orders_cache` com `order_id`, `shipment_id`, `order_status`, `buyer_nickname`, `buyer_name`, `total_amount`, etc.
- Buscar e upsert dos items do pedido em `meli_order_items_cache`
- Continuar com a logica de automacao existente

### Parte 2: Webhook de pedidos tambem atualiza shipment

Quando o webhook de `orders_v2` chega (ex: NF emitida), o status do shipping muda. Alem de atualizar o pedido, o sistema tambem vai:
- Extrair o `shipping.id` do pedido
- Buscar `GET /shipments/{id}` na API do ML
- Upsert em `meli_shipments_cache` com o status atualizado

Isso garante que ao emitir NF no ML, o sistema atualiza tanto o pedido quanto o envio em tempo real.

### Parte 3: Manter o job agendado como fallback

O `shipping-status-sync` (a cada 10 min) e o `orders-hourly-sync` continuam funcionando como rede de seguranca. Se o webhook falhar ou atrasar, esses jobs corrigem os dados periodicamente.

## Resumo do Fluxo

```text
ML emite NF / Nova venda
       |
       v
  Webhook ML (orders_v2)
       |
       v
  ml-webhook-ingest (enfileira)
       |
       v
  ml-worker-process (processa)
       |
       +---> Upsert meli_orders_cache (NOVO)
       +---> Upsert meli_order_items_cache (NOVO)
       +---> GET /shipments/{id} + Upsert meli_shipments_cache (NOVO)
       +---> Automacao de boas-vindas (existente)
       |
       v
  Dashboard atualizado em tempo real
```

Fallback: `orders-hourly-sync` (a cada hora) + `shipping-status-sync` (a cada 10 min)

## Detalhes Tecnicos

### Arquivo modificado: `supabase/functions/ml-worker-process/index.ts`

**Funcao `processOrderEvent`** - adicionar antes da logica de automacao:

1. **Upsert do pedido**: Salvar em `meli_orders_cache` com os mesmos campos que o `orders-hourly-sync` usa (user_id, seller_id, order_id, created_at_meli, order_status, shipment_id, buyer_nickname, buyer_name, total_amount, items_count, last_sync_at)

2. **Upsert dos items**: Para cada item do pedido, salvar em `meli_order_items_cache` (seller_id, order_id, item_id, variation_id, title, quantity, unit_price, etc.)

3. **Sync do shipment**: Se o pedido tem `shipping.id`, buscar `GET /shipments/{shipping.id}` e upsert em `meli_shipments_cache` com status, substatus, tracking_number, receiver_name, logistic_type, label_available

4. **Remover restricao de status**: Atualmente o `processOrderEvent` so processa pedidos `paid`. O upsert da cache deve acontecer para TODOS os status (paid, cancelled, etc.), e so a automacao de boas-vindas continua restrita a `paid`.

### Nenhuma migracao SQL necessaria

A estrutura das tabelas ja suporta todos os campos necessarios. A mudanca e apenas no codigo da Edge Function.

