

# Correção: Seleção "Todos" ignora filtro de logística

## Problema

O bug está na função `selectAll` do hook `useShippingLabels.ts`. Ela seleciona **todos** os pedidos selecionáveis, ignorando o filtro de logística ativo (Coleta/Flex/Full). Resultado: mesmo com filtro "Coleta" ativo, pedidos Flex são selecionados invisívelmente, e na hora de gerar etiquetas, a validação detecta tipos mistos e bloqueia.

**Raiz do problema (linha 1021-1023):**
```typescript
const selectAll = useCallback(() => {
  const selectableOrders = orders.filter(o => o.selectable);
  // ↑ NÃO filtra por logistic_type — seleciona tudo
  setSelectedIds(new Set(selectableOrders.map(o => o.id)));
}, [orders]);
```

O filtro de logística é aplicado apenas na **renderização da tabela** (ShippingLabels.tsx linhas 257-262), mas a seleção opera sobre a lista completa.

## Correção

Duas mudanças:

### 1. Passar o filtro de logística para o `selectAll`

Em `ShippingLabels.tsx`, ao invés de passar `selectAll` direto do hook, criar um wrapper que filtra os pedidos visíveis:

```typescript
const handleSelectAll = useCallback(() => {
  const visible = logisticFilter === 'all'
    ? orders.filter(o => o.selectable)
    : orders.filter(o => {
        if (!o.selectable) return false;
        if (logisticFilter === 'flex') return o.logistic_type === 'self_service';
        if (logisticFilter === 'full') return o.logistic_type === 'fulfillment';
        return o.logistic_type && o.logistic_type !== 'self_service' && o.logistic_type !== 'fulfillment';
      });
  setSelectedIds(new Set(visible.map(o => o.id)));
}, [orders, logisticFilter]);
```

Ou, expor `setSelectedIds` do hook e montar a seleção no page.

### 2. Limpar seleção ao trocar filtro de logística

Quando o usuário muda de "Coleta" para "Flex" (ou vice-versa), limpar a seleção para evitar seleções fantasma:

```typescript
useEffect(() => {
  clearSelection();
}, [logisticFilter]);
```

## Arquivos afetados
- **`src/pages/ShippingLabels.tsx`** — wrapper `handleSelectAll` com filtro + limpar seleção ao trocar filtro
- **`src/hooks/useShippingLabels.ts`** — expor `setSelectedIds` (ou aceitar filtro como parâmetro do `selectAll`)

## Resultado
- Filtro "Coleta" → selecionar todos → gera apenas Coleta ✓
- Filtro "Flex" → selecionar todos → gera apenas Flex ✓
- Trocar filtro limpa a seleção, sem seleções fantasma

