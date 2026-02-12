
# Plano: Sincronizacao Automatica de Status + Cache Inteligente para Etiquetas de Envio

## Problemas Identificados

1. **Status nao atualiza automaticamente** -- O sistema busca pedidos e envios na sincronizacao manual, mas nunca atualiza *apenas o status* dos envios ja cacheados. Se voce emitiu NF ou imprimiu no ML, o sistema nao reflete isso.

2. **Webhook ignora topic "shipments"** -- O `ml-worker-process` processa `items`, `orders_v2`, `messages` e `questions`, mas **nao trata o topic `shipments`**. Quando o ML manda um webhook de mudanca de status de envio, ele e simplesmente ignorado (marcado como "done" sem acao).

3. **Nao ha sync automatico periodico de status** -- O `orders-hourly-sync` sincroniza *pedidos* (orders) a cada hora, mas nao atualiza os *envios* (shipments). O status fica preso no que foi buscado na primeira sincronizacao.

4. **Troca de periodo (Hoje -> 7 dias) recarrega tudo** -- Quando voce muda o filtro de periodo, o sistema refaz a query inteira do banco + joins de envios/NFs, sem cache local dos dados ja carregados.

---

## Solucao em 4 Partes

### Parte 1: Processar Webhook de Shipments no Worker

**Arquivo:** `supabase/functions/ml-worker-process/index.ts`

Adicionar handler `processShipmentEvent()` que:
- Extrai o `shipment_id` do resource (`/shipments/12345`)
- Busca status atualizado na API ML (`GET /shipments/{id}`)
- Faz upsert no `meli_shipments_cache` com o novo status/substatus
- Registra no topicFeatureMap para que o evento nao seja ignorado

Registrar no switch-case do worker:
```
case "shipments":
  processResult = await processShipmentEvent(supabase, event, integration);
  break;
```

E habilitar no feature_flags padrao: `can_sync_shipments: true`.

### Parte 2: Criar Edge Function de Status Sync Periodico

**Novo arquivo:** `supabase/functions/shipping-status-sync/index.ts`

Edge Function agendada (via pg_cron a cada 10 minutos) que:
1. Busca todas contas ML ativas
2. Para cada conta, busca envios com `shipment_status` em `ready_to_ship` ou `handling` (os que podem mudar) dos ultimos 7 dias
3. Faz batch GET na API ML (`/shipments/{id}`) para verificar mudancas
4. Atualiza `meli_shipments_cache` apenas quando status mudou
5. Respeita rate limits com delay de 200ms entre chamadas e 2s entre contas
6. Usa lock via `sync_scheduler` para evitar execucoes simultaneas

Isso garante que mesmo sem webhook, os status se atualizem automaticamente.

### Parte 3: Cache Inteligente no Frontend

**Arquivo:** `src/hooks/useShippingLabels.ts`

Refatorar o carregamento para usar cache em memoria por periodo:

1. **Cache de dados por periodo** -- Manter um `useRef` com os dados ja carregados por cada periodo (hoje, 7d, 15d, 30d). Quando o usuario troca de periodo:
   - Se ja tem dados em cache, exibe imediatamente
   - Em background, faz refetch apenas dos status que podem ter mudado (envios com status `ready_to_ship`, `handling`, `invoice_pending`)
   
2. **Query otimizada para troca de periodo** -- Em vez de refazer a query completa de orders + shipments + invoices, manter o `ordersData` em cache e apenas expandir/filtrar conforme o periodo muda

3. **Refetch incremental de status** -- Adicionar funcao `refreshShipmentStatuses()` que busca apenas envios "ativos" (nao delivered/shipped) e atualiza o cache local, sem refazer toda a pipeline

4. **Auto-refresh a cada 5 minutos** -- Adicionar `setInterval` que chama `refreshShipmentStatuses()` silenciosamente para pedidos do dia, sem mostrar spinner

### Parte 4: Registrar Cron Job no Banco

Via SQL (nao migration, pois contem dados do projeto):
- Habilitar extensoes `pg_cron` e `pg_net`
- Agendar `shipping-status-sync` a cada 10 minutos
- Adicionar entrada no `sync_scheduler` para controle de lock

---

## Detalhes Tecnicos

### Fluxo de Atualizacao de Status

```text
ML muda status do envio
       |
       v
+--[Webhook ML]--+     +--[Cron 10min]--+
|  ml-webhook-   |     | shipping-      |
|  ingest        |     | status-sync    |
+-------+--------+     +-------+--------+
        |                       |
        v                       v
  webhook_events          meli_shipments_cache
        |                  (status atualizado)
        v                       |
  ml-worker-process             |
  processShipmentEvent()        |
        |                       |
        v                       v
  meli_shipments_cache    Frontend auto-refresh
  (status atualizado)     a cada 5 minutos
```

### Envios que Precisam de Atualizacao

Apenas envios com estes status precisam ser verificados periodicamente:
- `ready_to_ship` (pode mudar para shipped, printed, etc.)
- `handling` (em processamento)

Envios com status `delivered`, `shipped`, `not_delivered`, `cancelled` sao finais e nao precisam mais ser verificados.

### Rate Limits

- **Shipping status sync:** 200ms entre chamadas, max 50 envios por conta por ciclo
- **Webhook worker:** ja tem delay de 100ms entre eventos
- **Frontend auto-refresh:** a cada 5 minutos, busca apenas do banco local (sem chamar ML)

### Impacto nos Arquivos

| Arquivo | Acao |
|---------|------|
| `supabase/functions/ml-worker-process/index.ts` | Adicionar `processShipmentEvent()` |
| `supabase/functions/shipping-status-sync/index.ts` | Novo - sync periodico de status |
| `src/hooks/useShippingLabels.ts` | Cache por periodo + auto-refresh |
| SQL (via insert tool) | Cron job pg_cron + sync_scheduler entry |
