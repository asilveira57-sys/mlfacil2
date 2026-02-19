

# Corrigir Filtro "Envios de Hoje" - Separar Postagem vs Vendas

## Problema
O filtro "Envios de hoje" esta usando a data de venda (`created_at_meli`) como fallback, mostrando apenas pedidos vendidos hoje. O correto e mostrar todos os pedidos que precisam ser despachados hoje (prazo de postagem hoje ou atrasados), independente de quando foram vendidos.

## Solucao

### 1. Corrigir a funcao SQL `get_shipping_orders`

Alterar o bloco `today_dispatch` para remover o filtro de `created_at_meli` do fallback. A logica correta:
- Se `estimated_handling_limit` existe: mostrar se o prazo e hoje ou esta atrasado
- Se `estimated_handling_limit` e NULL: mostrar se o envio tem status ativo (`ready_to_ship`, `handling`, `pending`) sem restringir por data de venda

Remover a linha `AND o.created_at_meli >= v_today_start` do fallback, pois pedidos vendidos ha dias podem ter prazo de despacho hoje.

### 2. Adicionar filtro "Hoje" (vendas) separado

Adicionar um novo periodo `today_sales` nos filtros do frontend que filtra por `created_at_meli` do dia atual. Isso da ao usuario dois botoes distintos:
- **Envios de hoje** = postagem/despacho do dia (filtro de shipment)
- **Hoje** = vendas realizadas hoje (filtro de data)

### 3. Atualizar o frontend

**`src/hooks/useShippingLabels.ts`**:
- Adicionar `today_sales` ao tipo `PeriodFilter`
- No `getDateRange`, tratar `today_sales` como filtro de data do dia atual (inicio e fim do dia)

**`src/components/shipping/ShippingFilters.tsx`**:
- Adicionar botao "Hoje" na lista de periodos, posicionado entre "Todos" e "Envios de hoje"

**Arquivos de traducao** (`en`, `pt-BR`, `es`):
- Adicionar chave `today_sales` com "Hoje" / "Today" / "Hoy"

---

## Detalhes Tecnicos

### Migracao SQL

```sql
-- Corrigir fallback do today_dispatch: remover filtro de created_at_meli
-- Fallback para shipments sem deadline: mostrar se status ativo, sem restringir data de venda
AND (
  p_period_type != 'today_dispatch'
  OR (
    (s.estimated_handling_limit IS NOT NULL AND s.estimated_handling_limit <= v_today_end)
    OR
    (s.estimated_handling_limit IS NULL 
     AND s.shipment_status IN ('ready_to_ship','handling','pending'))
  )
)
```

### Mudancas no Frontend

- `PeriodFilter`: `'all' | 'today_sales' | 'today' | '7d' | '15d' | '30d' | 'custom'`
- `PERIOD_KEYS` no filtro: adicionar `{ value: 'today_sales', labelKey: 'today_sales' }` entre "Todos" e "Envios de hoje"
- `getDateRange` para `today_sales`: retorna inicio e fim do dia atual em Brasilia

### Arquivos Modificados
- **Migracao SQL** (nova) - corrigir funcao `get_shipping_orders`
- `src/hooks/useShippingLabels.ts` - adicionar `today_sales`, ajustar tipo e logica
- `src/components/shipping/ShippingFilters.tsx` - adicionar botao "Hoje"
- `src/locales/pt-BR/shipping.json` - adicionar `"today_sales": "Hoje"`
- `src/locales/en/shipping.json` - adicionar `"today_sales": "Today"`
- `src/locales/es/shipping.json` - adicionar `"today_sales": "Hoy"`

