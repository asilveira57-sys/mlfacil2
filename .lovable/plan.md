
# Corrigir Filtros de Período e Status das Etiquetas de Envio

## Problema Atual
Os filtros de período ("Envios de hoje", "7 dias", etc.) e status ("Reimprimir", "Aguardando NF") estão com lógica misturada na RPC do banco de dados, fazendo com que:
- "7 dias" mostre 0 resultados mesmo tendo 182 pedidos nos últimos 7 dias
- "Envios de hoje" filtre por substatus em vez de apenas filtrar pelo prazo de despacho
- "Reimprimir" mostre 0 mesmo tendo 8 etiquetas com substatus "printed"
- "Todos" limite artificialmente a 30 dias

## Solucao

### Separar claramente as responsabilidades:
- **Filtros de periodo** (Todos, Envios de hoje, 7d, 15d, 30d): filtram APENAS por data
- **Filtros de status** (Todos, Para imprimir, Aguardando NF, Reimprimir): filtram APENAS pelo `final_status` calculado

### Mudancas necessarias:

**1. Atualizar a RPC `get_shipping_orders` (migracao SQL)**

Remover a restricao de substatus do filtro `today_dispatch`. Ele deve apenas:
- Filtrar por `estimated_handling_limit` sendo hoje ou atrasado (quando disponivel)
- Quando `estimated_handling_limit` for NULL, usar `created_at_meli` do dia como fallback (pedidos criados hoje que ainda nao tem prazo populado)
- NAO restringir por substatus/logistic_type (isso e trabalho do filtro de status)

**2. Corrigir o hook `useShippingLabels.ts`**

- "Todos" (period `all`): remover o limite de 30 dias, enviar `dateFrom/dateTo` como null para buscar tudo
- "Envios de hoje" (`today`): enviar `dateFrom/dateTo` como null e `p_period_type = 'today_dispatch'` (a RPC cuida da filtragem)

**3. Publicar as mudancas**

Apos aplicar a migracao, as contagens de status (reimprimir, aguardando_nf, pronta) serao calculadas corretamente dentro do periodo selecionado.

---

## Detalhes tecnicos

### RPC `get_shipping_orders` - Nova logica do WHERE para `today_dispatch`:

```text
AND (
  p_period_type != 'today_dispatch'
  OR (
    -- Se tem prazo de despacho, mostra se for hoje ou atrasado
    (s.estimated_handling_limit IS NOT NULL AND s.estimated_handling_limit <= v_today_end)
    OR
    -- Fallback: pedidos criados hoje sem prazo populado que tem envio pendente
    (s.estimated_handling_limit IS NULL 
     AND o.created_at_meli >= v_today_start 
     AND s.shipment_status IN ('ready_to_ship','handling','pending'))
  )
)
```

### Hook `useShippingLabels.ts` - Corrigir `getDateRange`:

- `case 'all'`: retornar `{ dateFrom: null, dateTo: null }` (sem limite de data)
- `case 'today'`: manter retornando null (RPC controla via `today_dispatch`)

### Dados atuais que devem aparecer:
- 8 envios com substatus `printed` (reimprimir) 
- 24 envios com substatus `invoice_pending` (aguardando NF)
- 3 envios com substatus `ready_to_print` (para imprimir)
- Total de ~35 pedidos acionaveis
