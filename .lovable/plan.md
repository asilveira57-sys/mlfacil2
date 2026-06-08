## Diagnóstico

Confirmei no banco para a ADECONEX:

Os 3 pedidos que o Mercado Livre mostra como "Para enviar amanhã / no dia 12 / no dia 16" (`2000013378932969`, `2000013363351761`, `2000013361395225`) estão no nosso cache com:

- `shipment_status = 'pending'`
- `shipment_substatus = 'buffered'`  ← marcador do ML para envios **agendados** (data futura de liberação)
- `logistic_type = 'xd_drop_off'`
- `label_available = false`
- `estimated_handling_limit = NULL` e `estimated_schedule_limit = NULL`

Por isso a soma "bate" (24 ≈ 21 do ML + 3 agendados), mas eles aparecem indevidamente em **Aguardando NF** e em **Envios de hoje**. O ML não os exibe no card "PARA ENVIAR / Até as 12:00h" justamente porque a data programada é futura.

Na correção anterior, ao incluir shipments sem cutoff no `today_dispatch`, varremos junto os `buffered` — que precisam ficar fora.

## Plano de correção

### 1. RPC `get_shipping_orders` (migration)

a) Detectar agendados de forma única:
```
is_scheduled := (shipment_substatus = 'buffered')
               OR (shipment_status = 'pending' AND shipment_substatus IN ('buffered','scheduled'))
               OR (estimated_schedule_limit > now() AND label_available = false)
```

b) Excluir `is_scheduled = true` de **todos** os buckets operacionais atuais:
- `para_imprimir`
- `aguardando_nf`
- `pronta_enviar`
- `today_dispatch` (`periodFilter = 'today'`)
- contagem `all`

c) Criar novo bucket/contagem **`agendadas`** (futuras) — não entra no total "Todos", igual ao ML.

d) Manter `estimated_schedule_limit` (quando existir no raw) como data exibida; quando ausente, exibir a data textual do ML se disponível, senão "Agendada".

### 2. Sync de shipments

Garantir que o pipeline de sync de `meli_shipments_cache` persista `estimated_schedule_limit` quando o ML retornar para shipments `buffered` (hoje está vindo NULL). Caminho: `shipping.estimated_schedule_limit` ou `lead_time.estimated_schedule_limit` do payload `/shipments/{id}`.

### 3. Frontend

- `ShippingFilters.tsx`: adicionar chip **"Agendadas"** com contagem própria (separado de "Todos").
- `useShippingLabelsV2.ts` / `useShippingLabels.ts`: mapear nova chave `statusCounts.agendadas` e novo `statusFilter='agendadas'`.
- `shippingStatusMap.ts`: badge específico (ex.: cinza/âmbar) para `agendada` com tooltip "Liberada em DD/MM".
- Traduções `pt-BR/en/es`: chave `status.scheduled` / `Agendadas` / `Scheduled` / `Programadas`.

### 4. Validação

Após aplicar:
- ADECONEX deve mostrar **Todos = 21**, **Aguardando NF = 18**, **Prontas = 2**, **Atrasadas/Para imprimir = 1**, **Agendadas = 3** (com `2000013378932969`, `2000013363351761`, `2000013361395225`).
- Filtro "Envios de hoje" não deve incluir os 3 agendados.
- Filtro "Agendadas" lista exatamente os 3, com a data futura visível.

## Arquivos afetados

- Nova migration para `get_shipping_orders`
- `supabase/functions/meli-shipments-sync/*` (persistência de `estimated_schedule_limit` para buffered)
- `src/hooks/useShippingLabels.ts`, `useShippingLabelsV2.ts`
- `src/components/shipping/ShippingFilters.tsx`
- `src/lib/shippingStatusMap.ts`
- `src/locales/{pt-BR,en,es}/shipping.json`
