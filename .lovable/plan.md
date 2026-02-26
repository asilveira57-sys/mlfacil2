

## Problema

A tabela `account_category_activity` só possui dados para a conta `66043362` (ADECONEXVV). A conta `1411095727` (ADECONEX.SP) não tem registros, então o RPC `get_seller_visible_categories` retorna `[]`.

## Solução

Substituir o `useSellerCategories` (que depende da tabela local) por uma chamada direta à edge function `ml-price-adjustment` com action `get_seller_categories`, que busca as categorias em tempo real da API do Mercado Livre.

## Alteração: `src/components/wholesale/WholesaleCategoryBindings.tsx`

1. Remover import de `useSellerCategories`
2. Substituir a query de categorias (linha 57) por uma `useQuery` que chama:
   ```ts
   supabase.functions.invoke("ml-price-adjustment", {
     body: { action: "get_seller_categories", sellerId: resolvedSellerId }
   })
   ```
3. Mapear o retorno `data.categories` (array `{ id, name, results }`) para o formato usado no select:
   - `category_id` → `id`
   - `category_name` → `name`  
   - Label: `"Nome (X anúncios)"`
4. Ajustar referências de `c.category_id` → `c.id`, `c.category_name` → `c.name`, `c.orders_count_90d` → `c.results`
5. No `handleAdd`, passar `category_path: []` pois a API não retorna path

Nenhuma outra alteração necessária — a edge function já aceita `sellerId` e resolve o token correto.

