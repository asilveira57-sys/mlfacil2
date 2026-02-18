

# Plano Definitivo: "Envios de Hoje" + Sincronizacao de Status

## Entendimento do Problema

"Envios de hoje" no Mercado Livre NAO e um filtro por data de venda. E um filtro por **prazo de despacho** (`estimated_handling_limit`) -- ou seja, pedidos que o vendedor precisa despachar HOJE, independente de quando a venda aconteceu (pode ser de feriado, final de semana, etc.).

Atualmente o sistema tem 3 problemas criticos:

1. **Campo `estimated_handling_limit` nao existe no banco** -- a tabela `meli_shipments_cache` nao armazena o prazo de despacho. Sem esse dado, e impossivel saber quais envios sao "de hoje".

2. **Logica de `final_status` incorreta** -- envios fulfillment ja entregues (832 registros `delivered`) ainda aparecem como "full" porque o CASE verifica `logistic_type` ANTES do `shipment_status`. Resultado: pedidos ja entregues aparecem como se precisassem de NF.

3. **Filtro "Hoje" usa data de venda** -- atualmente filtra por `created_at_meli` das ultimas 24h, quando deveria filtrar por prazo de despacho.

## Plano de Correcao (4 Etapas)

### Etapa 1: Adicionar campo `estimated_handling_limit` ao banco

Criar migration para adicionar a coluna na tabela `meli_shipments_cache`:

```text
ALTER TABLE meli_shipments_cache 
  ADD COLUMN estimated_handling_limit TIMESTAMPTZ;

CREATE INDEX idx_shipments_handling_limit 
  ON meli_shipments_cache(seller_id, estimated_handling_limit) 
  WHERE shipment_status IN ('ready_to_ship','handling','pending');
```

### Etapa 2: Capturar `estimated_handling_limit` durante o sync

Atualizar **2 edge functions** para extrair e salvar o campo:

**`ml-sync-shipments/index.ts`** (sync sob demanda do usuario):
- A API do ML retorna `shipping_option.estimated_handling_limit.date` no response de `/shipments/{id}`
- Desde maio/2025, a API deprecou esse campo no shipment raiz e o moveu para `/shipments/{id}/sla`
- Estrategia: tentar extrair de `lead_time.estimated_handling_limit.date` do response principal. Se nulo, fazer chamada adicional a `/shipments/{id}/sla` para buscar a data

**`shipping-status-sync/index.ts`** (sync automatico a cada 10min):
- Mesma logica: ao atualizar um envio, salvar tambem o `estimated_handling_limit`
- Corrigir a autenticacao que impede o cron de executar (o `includes()` no header e fragil)
- Expandir `ACTIVE_STATUSES` para incluir `pending` (pedidos buffered)
- Aumentar `MAX_SHIPMENTS_PER_ACCOUNT` para 150

### Etapa 3: Corrigir a RPC `get_shipping_orders`

Reescrever o CASE de `final_status` para priorizar status reais sobre logistic_type:

```text
CASE
  -- Sem dados de envio
  WHEN s.shipment_id IS NULL AND o.shipment_id IS NOT NULL THEN 'pendente_sync'
  WHEN o.shipment_id IS NULL THEN 'outros'
  -- Status finais (ANTES de verificar logistic_type)
  WHEN s.shipment_status IN ('delivered','not_delivered') THEN 'enviado'
  WHEN s.shipment_status = 'shipped' THEN 'enviado'
  -- Fulfillment ainda em processamento
  WHEN s.logistic_type IN ('fulfillment','cross_docking') 
       AND s.shipment_status IN ('ready_to_ship','handling','pending') THEN 'full'
  -- Operacional do vendedor
  WHEN s.shipment_substatus = 'printed' THEN 'reimprimir'
  WHEN s.shipment_substatus = 'invoice_pending' THEN 'aguardando_nf'
  WHEN s.shipment_substatus = 'ready_to_print' 
       AND COALESCE(s.label_available, false) THEN 'pronta'
  ELSE 'outros'
END
```

Adicionar suporte ao filtro `today` baseado em `estimated_handling_limit`:
- Novo parametro `p_period_type` na RPC ('date_range' ou 'today_dispatch')
- Quando `p_period_type = 'today_dispatch'`: filtrar por `s.estimated_handling_limit` no dia de hoje (fuso Brasilia), ignorando `p_date_from`/`p_date_to`
- Incluir o campo `estimated_handling_limit` no retorno para exibir o horario limite na tabela

### Etapa 4: Atualizar o frontend

**`useShippingLabels.ts`**:
- Quando `periodFilter = 'today'`: enviar `p_period_type = 'today_dispatch'` para a RPC (sem date range)
- Adicionar `estimated_handling_limit` ao tipo `ShippingOrder`

**`ShippingFilters.tsx`**:
- Renomear o botao "Hoje" para "Envios de hoje" para deixar claro que e sobre despacho, nao data de venda

**`ShippingTable.tsx`**:
- Exibir o horario limite de despacho (ex: "Ate as 15:00h") na linha do pedido, similar ao Mercado Livre

## Impacto nos Dados Atuais

- Os 832 envios fulfillment `delivered` vao sair de "full" e ir para "enviado" (correcao imediata)
- Os 36 envios `invoice_pending` continuam aparecendo corretamente como "Aguardando NF"
- Os 41 envios `pending/buffered` passam a ser monitorados pelo sync de background
- O campo `estimated_handling_limit` sera preenchido progressivamente conforme o sync roda (a cada 10min para envios ativos, e sob demanda quando o usuario clica "Atualizar")

## Resumo de Arquivos Modificados

| Arquivo | Mudanca |
|---------|---------|
| Migration SQL | Adicionar coluna `estimated_handling_limit` + indice |
| `supabase/functions/ml-sync-shipments/index.ts` | Capturar `estimated_handling_limit` da API |
| `supabase/functions/shipping-status-sync/index.ts` | Capturar `estimated_handling_limit`, corrigir auth, expandir statuses |
| Migration SQL (RPC) | Corrigir `final_status`, adicionar filtro por despacho |
| `src/hooks/useShippingLabels.ts` | Novo tipo de filtro "today_dispatch" |
| `src/components/shipping/ShippingFilters.tsx` | Label "Envios de hoje" |
| `src/components/shipping/ShippingTable.tsx` | Mostrar horario limite |
| Traducoes (shipping.json) | Novas chaves para "Envios de hoje" e horario limite |

