

# Plano corretivo — Módulo Seed (métricas, visitas, thumbnails, tarefas)

## Diagnóstico confirmado

### 1. Vendas mostram 0 (7d e 30d)
**Causa-raiz encontrada:** No `seed-metrics-collector/index.ts`, a função `countSales` (linha 489) usa `.gte('created_at', dateFrom)`, mas a coluna real na tabela `meli_order_items_cache` é `created_at_meli`. A coluna `created_at` não existe nessa tabela, então a query retorna 0 silenciosamente.

### 2. Visitas e conversão mostram 0 ou "-"
As visitas dependem do collector ter rodado com sucesso. Como a screenshots mostram `Visitas 7d: 21` no drawer mas `Vendas 7d: 0`, o problema de visitas é parcial — a API de visitas funciona, mas a conversão fica `null` porque `sales30d = 0` (bug do item 1). Corrigindo vendas, a conversão será calculada automaticamente.

### 3. Thumbnails ausentes em alguns itens
O hydration no `useSeed.ts` busca por `item_id` e `sku` no `meli_listings_cache`, mas itens plantados com SKU que não está no listings_cache nem no order_items_cache ficam sem thumbnail. Além disso, ao plantar o item, se o cache local está vazio, `item_thumbnail` é salvo como `null` e nunca mais atualizado.

### 4. "Criar tarefa" não funciona
No `SeedItemDetailDrawer.tsx` (linha 553), o botão "Criar tarefa para este anúncio" executa apenas `toast.info("Em breve: Criar tarefa")` — é um placeholder não implementado.

---

## Correções

### Correção 1: Fix `countSales` — coluna errada
**Arquivo:** `supabase/functions/seed-metrics-collector/index.ts`
- Nas 3 ocorrências de `.gte('created_at',` dentro de `countSales` (linhas 489, 499, 511), trocar por `.gte('created_at_meli', dateFrom)`.
- Isso corrige vendas 7d, 30d, intervalo médio, estabilidade, saúde e conversão de uma só vez.

### Correção 2: Atualizar thumbnails pendentes no collector
**Arquivo:** `supabase/functions/seed-metrics-collector/index.ts`
- Dentro de `processPlantedItem`, após resolver `mlbIds`, verificar se `item.item_thumbnail` é null.
- Se null e existem `mlbIds`, buscar thumbnail do `meli_listings_cache` por `item_id` e atualizar o `send_planted_items` com o thumbnail encontrado.
- Também atualizar `item_title` se estiver null.

### Correção 3: Implementar "Criar tarefa" real
**Arquivo:** `src/components/seed/SeedItemDetailDrawer.tsx`
- Substituir o placeholder por lógica real que:
  1. Busca o workspace do usuário (query `workspaces` com `owner_id = user.id`, limit 1).
  2. Insere na tabela `tasks` com: `title = "Revisar: {item_title}"`, `workspace_id`, `source_type = 'seed'`, `priority = 'medium'`.
  3. Toast de sucesso com link para `/tarefas`.
- Se não houver workspace, mostrar toast informando para criar um workspace primeiro.

### Correção 4: Melhorar hydration de thumbnails no frontend
**Arquivo:** `src/hooks/useSeed.ts`
- Na hidratação de `plantedWithMetrics` (linha 340-347), quando `item_thumbnail` e `listing?.thumbnail` são ambos null, tentar buscar diretamente do `meli_listings_cache` usando o `item_id` base (sem variante).
- Isso cobre o caso onde o cache in-memory não foi populado.

---

## Arquivos impactados
- `supabase/functions/seed-metrics-collector/index.ts` (fix `created_at` → `created_at_meli` + hydration de thumbnails)
- `src/components/seed/SeedItemDetailDrawer.tsx` (implementar criação de tarefa)
- `src/hooks/useSeed.ts` (melhorar fallback de thumbnails)

## Validação de aceite
1. Vendas 7d e 30d refletem dados reais após rodar o collector.
2. Conversão calculada corretamente (vendas/visitas).
3. Thumbnails preenchidas para todos os itens com MLB ID válido.
4. Botão "Criar tarefa" cria uma tarefa real no workspace do usuário.

