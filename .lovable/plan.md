

## Plano: Separar colunas de Comissão ML e Custo de Mercadoria

### Problema
A coluna "Custo" atual exibe `cost_total` (soma de comissão ML + custo de mercadoria + embalagem + impostos + frete + outros). O usuário precisa ver a **Comissão ML** (`commission_cost` / `cost_fees`) e o **Custo de Mercadoria** (`cost_items_total`) como colunas independentes.

### Mudanças

**1. Atualizar a tabela de pedidos (`CostOrders.tsx`)**
- Substituir a coluna única "Custo" por duas colunas:
  - **Comissão ML** → exibe `order.commission_cost` (já disponível no campo `cost_fees` retornado pelo backend)
  - **Custo Merc.** → exibe o custo de mercadoria (campo `cost_items_total` do backend, precisa ser mapeado na interface)
- Adicionar sorting para a nova coluna de comissão (`commission_cost`)
- Atualizar o `SortKey` type para incluir `commission_cost`
- Atualizar o `colSpan` da linha vazia de 14 para 15

**2. Garantir que o backend retorna os campos necessários**
- Verificar a edge function `cost-engine/orders` para confirmar que `cost_fees` (comissão) e `cost_items_total` (custo mercadoria) são retornados na listagem de pedidos
- Se `cost_items_total` não estiver sendo retornado, adicioná-lo ao SELECT da query

**3. Mapear campo na interface `OrderCost`**
- Adicionar `cost_items_total: number` à interface se não existir
- O campo `cost_fees` já existe como `commission_cost` na interface

### Layout final das colunas

```text
Data | Pedido | Status | Comprador | Receita | Comissão ML | Custo Merc. | Frete (ML) | Embalagem | Impostos | Lucro | Margem | Status | Ações
```

### Escopo
- Apenas frontend: reorganização de colunas na tabela `CostOrders.tsx`
- Possível ajuste no backend se `cost_items_total` não estiver no payload de listagem

