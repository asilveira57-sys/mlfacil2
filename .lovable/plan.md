
## Diagnóstico

Investiguei o banco, a edge function `ml-sales-data` e o estado de conexão. Os dois problemas têm causa identificada:

### 1) Dashboard zerado (R$ 0 / 0 pedidos)

A conta ativa (ADECONEXVV — `66043362`) tem **6.069 pedidos** em `meli_orders_cache` e o RPC `get_sales_metrics` retorna corretamente:

```
{ "metrics": { "orders_today": 4, "revenue_today": 396.55,
               "orders_7d": 119, "revenue_7d": 17539.67,
               "orders_period": 111, "revenue_period": 16950.86, ... },
  "monthly_sales": [...] }
```

Porém a edge function `supabase/functions/ml-sales-data/index.ts` lê os campos em **camelCase achatado** (`metricsData.revenueTotal`, `metricsData.ordersPeriod`, etc.). Como o RPC devolve **snake_case aninhado em `metrics`**, todos os campos viram `undefined` → `Number(undefined) || 0` → **R$ 0 / 0 pedidos**. Os logs confirmam: `ordersTotal: undefined, revenueTotal: undefined, ...`.

Efeito colateral: como `_debug.cachedOrdersCount` também vira 0, o `SalesDashboard` dispara `startProgressiveSync` em todo primeiro load, mantendo o badge "Sincronizando..." aceso indefinidamente, mesmo com cache cheio.

### 2) "Restaurando sua conexão" toda hora ao trocar de tela

Três fatores se somam:

- `mapMlAccountToUnified` (em `accountUnification.ts`) **rebaixa para `attention`** qualquer conta cujo `token_expires_at` esteja no passado, mesmo que o `connection_status` no banco esteja `connected`. Como o estado `accounts` no `ActiveAccountContext` só é recarregado em momentos pontuais, depois de algumas horas o front "acha" que a conta caiu, embora o backend ainda consiga renovar transparentemente.
- `useMLConnectionState` mantém `attemptedRef` **por instância do hook**. Cada navegação para `/inicio` desmonta e remonta o hook → `attemptedRef` zera → ao ver `status === 'attention'` dispara `refreshAccountToken` de novo e mostra a tela "Restaurando sua conexão".
- `ReconnectingCard` usa `useState(() => { setInterval(...) })` em vez de `useEffect`, então o interval nem chega a rodar (cosmético, mas errado).

## Plano de correção

### A. Dashboard de vendas (edge function `ml-sales-data`)

1. Ajustar o handler para ler o contrato real do RPC:
   - Acessar `metricsData.metrics.<snake_case>` (orders_today, revenue_today, orders_7d, revenue_7d, orders_30d, revenue_30d, orders_period, revenue_period, orders_prev_*, revenue_prev_*, orders_total, revenue_total, orders_yesterday, revenue_yesterday) e mapear para o camelCase já consumido pelo front (`revenueToday`, `ordersToday`, `revenue7d`, `orders7d`, `revenuePeriod`, `ordersPeriod`, `revenuePrevPeriod`, `ordersPrevPeriod`, etc.).
   - Calcular `averageTicket`, `averageTicket30d`, `averageTicketPeriod`, `averageTicketPrevPeriod` no edge a partir das somas (revenue/orders).
   - Mapear `metricsData.monthly_sales` → `monthlySales` (e usar como `availableMonths`).
2. Preencher `_debug.cachedOrdersCount` com um `SELECT count(*) FROM meli_orders_cache WHERE seller_id=...` para que o `SalesDashboard` não dispare `startProgressiveSync` quando o cache já tem dados, encerrando o badge "Sincronizando..." quando não há trabalho real.
3. Métricas que o RPC ainda não fornece (`cancelledOrders/Revenue`, `dailySales`, `topProducts`) seguem como 0/array vazio nesta correção — o objetivo aqui é destravar o card principal de Receita/Pedidos/Ticket; um próximo passo opcional pode estender o RPC para incluí-las.

### B. Estado de conexão (parar o loop "Restaurando sua conexão")

1. Em `src/lib/accountUnification.ts` (`mapMlAccountToUnified`):
   - **Não** rebaixar de `connected` para `attention` apenas porque `token_expires_at < now()`. Respeitar o `connection_status` do banco. A renovação transparente continua a cargo de `getValidAccessToken` na hora da chamada à API do ML.
2. Em `src/contexts/ActiveAccountContext.tsx`:
   - Expor uma flag `isRefreshingToken` no contexto. Quando o `initialize` dispara o refresh proativo (status real `attention`), marcar `true` durante a operação e voltar para `false` ao fim.
   - Adicionar guarda em memória por `accountId` para não disparar dois refreshes simultâneos.
3. Em `src/hooks/useMLConnectionState.ts`:
   - **Remover** o `refreshAccountToken` disparado pelo hook. O hook passa a ser apenas observador.
   - Determinar o estado a partir do contexto: `CONNECTED` quando `activeAccount.status === 'connected'`; `RECONNECTING` somente enquanto `isRefreshingToken === true`; `RECONNECT_REQUIRED` quando status real for `disconnected`/`revoked` (ou `attention` após o refresh proativo ter falhado).
4. Em `src/components/dashboard/MLConnectionCard.tsx` (`ReconnectingCard`):
   - Trocar o `useState(() => setInterval(...))` por `useEffect(() => { const id = setInterval(...); return () => clearInterval(id); }, [])`.

### C. Validação manual após o build

1. Abrir `/inicio` com a conta ADECONEXVV ativa e confirmar Receita/Pedidos/Ticket preenchidos para "Hoje", "7 dias" e "30 dias".
2. Conferir que o badge "Sincronizando..." some quando o cache já está populado.
3. Navegar entre `/inicio`, `/etiquetas-de-envio` e voltar várias vezes confirmando que a tela "Restaurando sua conexão" **não** reaparece se o `connection_status` for `connected`.
4. Forçar uma conta com `connection_status='attention'` (ex.: MLFACIL_CONSULTORIA) e confirmar que ainda aparece o card de reconexão / botão "Reconectar".

## Arquivos afetados

- `supabase/functions/ml-sales-data/index.ts` (mapeamento snake_case → camelCase, monthlySales, cachedOrdersCount).
- `src/lib/accountUnification.ts` (remover rebaixamento por `token_expires_at`).
- `src/contexts/ActiveAccountContext.tsx` (flag `isRefreshingToken`, guarda anti-duplicação).
- `src/hooks/useMLConnectionState.ts` (apenas observador, sem disparar refresh).
- `src/components/dashboard/MLConnectionCard.tsx` (corrigir `ReconnectingCard`).

Nenhuma migração de banco é necessária; o RPC `get_sales_metrics` já está correto.
