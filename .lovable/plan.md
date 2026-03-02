

## Plano: Correções no Módulo de Custos / Pedidos

### Problemas Identificados

1. **Filtro "Sem custo e-commerce" não funciona para pedidos sem custo billing**: O filtro padrão "Status Venda = Pagos" exclui pedidos com `fee_ml_source` = `pending`/`no_charges` do resultado. Ao selecionar "Sem custo e-commerce", esses pedidos ficam invisíveis porque o backend já os filtrou antes.

2. **Seleção limitada à página atual**: Só é possível selecionar os 50 pedidos da página corrente. Falta opção de "Selecionar todos" (todas as páginas).

### Correções

**1. Corrigir filtro "Sem custo e-commerce"**

No backend (`supabase/functions/cost-engine/index.ts`), quando `orderStatus` for `'paid'` (padrão), o filtro exclui `pending`/`no_charges`. Preciso ajustar a lógica para que, quando `orderStatus` for `'all'` ou quando o filtro de e-commerce estiver ativo, não excluir esses registros. A solução mais limpa: quando `orderStatus === 'paid'`, manter o filtro atual. Mas o filtro "Sem Custo" (`pending_cost`) já existe como opção separada no dropdown de Status Venda. O problema real é que "Sem custo e-commerce" filtra `cost_other = 0`, o que é diferente de "sem billing". Vou verificar se o filtro está funcionando corretamente dentro do escopo `paid`.

Na verdade, o filtro "Sem custo e-commerce" (`cost_other = 0`) funciona dentro dos pedidos `paid` — ele mostra pedidos pagos que não têm custo e-commerce registrado. Se o usuário quer ver pedidos **sem custo de billing/comissão**, ele deve usar "Status Venda → Sem Custo". Vou renomear o filtro para ficar mais claro e garantir que o dropdown "Sem Custo" no Status Venda realmente funcione.

**2. Adicionar "Selecionar todos de todas as páginas"**

- Adicionar um banner que aparece quando todos da página estão selecionados: "Selecionar todos os {totalOrders} pedidos de todas as páginas?"
- Implementar um estado `selectAllPages` que, ao ativar, busca todos os `order_id`s do backend (nova rota ou parâmetro `ids_only=true`) e os adiciona ao `selectedOrders`.
- Alternativamente, no batch resync, quando `selectAllPages` estiver ativo, enviar os filtros para o backend processar em lote server-side ao invés de listar IDs no frontend.

### Implementação

**Backend** (`supabase/functions/cost-engine/index.ts`):
- Adicionar suporte a `ids_only=true` na rota `/orders` que retorna apenas os `order_id`s sem paginação (para seleção total).

**Frontend** (`src/components/custos/CostOrders.tsx`):
- Quando o checkbox "selecionar todos" da página for marcado, mostrar banner: "Todos os {50} desta página selecionados. **Selecionar todos os {totalOrders}?**"
- Ao clicar, buscar IDs via `ids_only=true` e popular `selectedOrders`.
- Renomear ou esclarecer o filtro "Sem custo e-commerce" para evitar confusão com "Sem Custo" de billing.
- Manter ambas as opções: selecionar página atual (checkbox header) e selecionar todas as páginas (banner).

### Detalhes Técnicos

- A rota `ids_only` reutiliza os mesmos filtros existentes mas retorna só `order_id[]` sem limite de paginação
- O batch resync continua sendo sequencial (1 por 1 com delay de 500ms) para evitar rate limit
- O estado `selectAllPages` é resetado ao mudar filtros ou página

### Bulk Reimport/Resync em Background (v2 - Self-Chaining)

**Arquitetura**: Edge Function com auto-invocação encadeada (self-chaining):
1. Frontend cria job via `orders/bulk-reimport` → backend cria registro em `cost_bulk_jobs`, deleta caches, processa chunk de 10 pedidos
2. Ao terminar chunk, a Edge Function se auto-invoca via `orders/bulk-reimport-continue` com `x-internal-key` auth
3. Cada invocação processa 10 pedidos + 600ms delay entre cada → ~12s por chunk, bem dentro do timeout de 60s
4. Progresso salvo em `cost_bulk_jobs` (processed_count, success_count, error_count)
5. Frontend faz polling a cada 3s para mostrar progresso em tempo real
6. Se fechar o navegador, o processamento continua server-side até completar
7. Ao reabrir a página, o frontend detecta jobs ativos e retoma o polling
