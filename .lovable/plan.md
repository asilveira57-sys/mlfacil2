

## Plano: Corrigir refresh destrutivo + Mover "Modo Seguro 1 a 1" para backend

Dois problemas independentes resolvidos em conjunto.

---

### Problema 1: Refresh desnecessário ao trocar de aba/tela

**Causa raiz**: Em `Custos.tsx` (linha 69-72), toda vez que `activeTab` muda para `'pedidos'`, o código chama `invalidateCostCache('orders')`, que limpa o cache e força reload. E dentro de `CostOrders.tsx`, o `useEffect` na linha 687-691 recarrega pedidos quando qualquer filtro muda — incluindo quando o componente remonta ao voltar para a aba.

**Correção**:
- **Remover** `invalidateCostCache('orders')` do `useEffect` de troca de aba em `Custos.tsx` (linha 71). O cache de 3 minutos do `useCostModuleCache` já cuida de servir dados frescos. Se o usuário quiser forçar refresh, já existe o botão de refresh manual.
- **No `CostOrders.tsx`**: Adicionar um `ref` para evitar reload automático se os dados já foram carregados e o cache está válido (o `getCostCache` já faz isso, mas o `loadOrders` é chamado desnecessariamente toda vez que o componente remonta).

---

### Problema 2: "Modo Seguro 1 a 1" roda no frontend e aborta ao sair

**Causa raiz**: O `handleSafeResync` atual é um loop `for` no frontend. Ao navegar para outra página, o componente desmonta e o processamento para.

**Correção**: Mover para o backend reutilizando a infraestrutura de `cost_bulk_jobs` com um novo `job_type: 'safe_resync'`.

#### Backend (`supabase/functions/cost-engine/index.ts`):

1. **Novo case no router**: `orders/bulk-safe-resync` → chama `startBulkReimportJob` com `job_type = 'safe_resync'`
2. **Novo bloco em `processChunkAndContinue`**: Quando `job_type === 'safe_resync'`:
   - Chunk size = 1 (processa 1 pedido por vez)
   - Para cada pedido: chama `ml-sync-real-costs` com `action: 'resync_single'` (via fetch interno com service_role)
   - Retry 2x com delay de 2s em caso de erro
   - A cada 10 pedidos processados com sucesso, chama `calculateSingleOrder` para os 10 pendentes
   - Auto-encadeia via `EdgeRuntime.waitUntil` como os outros job types

#### Frontend (`src/components/custos/CostOrders.tsx`):

1. **Substituir `handleSafeResync`**: Em vez de loop local, chama `cost-engine/orders/bulk-safe-resync` (POST com `seller_id` + `order_ids`) e recebe `job_id`
2. **Reutilizar `pollJobProgress`**: O mesmo polling por DB que já existe para bulk jobs monitora o progresso do safe resync
3. **UI**: A barra verde de progresso continua igual, mas agora mostra dados do job no banco. Ao sair e voltar, o `checkActiveJob` no `useEffect` (linha 640-685) detecta o job ativo e retoma o polling automaticamente.

---

### Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `src/pages/Custos.tsx` | Remover `invalidateCostCache('orders')` da troca de aba |
| `src/components/custos/CostOrders.tsx` | Substituir loop local por chamada ao backend + polling |
| `supabase/functions/cost-engine/index.ts` | Novo endpoint `orders/bulk-safe-resync` + lógica `safe_resync` no processChunkAndContinue |

### Resultado esperado
- Trocar de aba/página não causa mais reload dos dados de pedidos
- O "Modo Seguro 1 a 1" roda no backend: o usuário pode sair da tela, fechar o navegador, e o processamento continua
- Ao voltar à aba de pedidos, o progresso é retomado automaticamente via polling

