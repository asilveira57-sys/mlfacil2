
## Plano: Adicionar Status da Venda no Módulo Custos / Pedidos

### Problema Identificado
O pedido `2000015130306570` aparece sem nome do comprador e sem indicação de que é uma devolução em andamento. A aba "Pedidos" do módulo de Custos não exibe o `order_status` da venda, impossibilitando identificar cancelamentos, devoluções, etc.

### O que será feito

**1. Adicionar coluna `order_status` ao retorno da API `cost-engine/orders`**
- No `getOrderCosts` do edge function `cost-engine/index.ts`, fazer um JOIN com `meli_orders_cache` para trazer o campo `order_status` atualizado para cada pedido listado.
- Para pedidos cancelados (que já vêm de `meli_orders_cache`), o status já está presente.

**2. Exibir o status da venda na tabela do frontend**
- Adicionar uma coluna "Status" na tabela de `CostOrders.tsx` com um Badge colorido:
  - `paid` → verde "Pago"
  - `cancelled` / `refunded` → vermelho "Cancelado" / "Reembolsado"
  - outros → amarelo com o status traduzido
- Posicionar a coluna logo após a data.

**3. Adicionar filtro por status da venda no frontend**
- O filtro `orderStatusFilter` já existe, mas será complementado para incluir opções como `refunded` e `partially_refunded`.

**4. Otimização: Não re-sincronizar vendas entregues há mais de 30 dias**
- No edge function `ml-sync-real-costs`, na lógica de `resync_single` e `handleReprocessPending`, antes de chamar a API do ML, verificar se o `order_status` é `delivered` e se `created_at_meli` tem mais de 30 dias. Se sim, pular a chamada e marcar como "frozen" (sem necessidade de atualização).
- No webhook/worker, manter a atualização normalmente para pedidos recentes.

### Detalhes Técnicos

- **Sem migração de banco**: Os campos `order_status` e `created_at_meli` já existem em `meli_orders_cache`. Apenas precisamos cruzar os dados no retorno da API.
- **Edge function `cost-engine`**: Após buscar os dados de `order_cost_breakdown_cache`, fazer batch lookup dos `order_id`s na `meli_orders_cache` para obter `order_status`.
- **Edge function `ml-sync-real-costs`**: Adicionar guard clause para pedidos antigos entregues.
- **Frontend**: Nova coluna + Badge com cores, sem impacto na paginação/ordenação existente.
