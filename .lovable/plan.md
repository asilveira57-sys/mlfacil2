

# Plano: Melhorias no Catálogo de Custos (Anúncios)

## Mudanças Solicitadas

### 1. Salvar custo sem refresh (inline like packaging)
- Atualizar custo localmente no state `products[]` após o POST retornar sucesso, sem chamar `loadCatalog()` novamente
- Mesmo padrão usado na embalagem: salva no backend, atualiza o item no array local

### 2. Ordenação server-side (Produto, SKU, Custo, Status)
- **Backend (`getCatalog`)**: Aceitar parâmetros `sort_by` (display_name | sku | cost_value | has_cost) e `sort_dir` (asc | desc)
- Aplicar sort no array completo antes de paginar
- **Frontend**: Headers clicáveis com seta indicando direção, mudar ordenação reseta para page 1

### 3. Filtros combinados
- **Custo**: Todos / Com custo / Sem custo (substituir o checkbox `onlyMissing` por Select)
- **Embalagem**: Todos / Com embalagem / Sem embalagem
- Backend: aceitar `cost_filter` (all | with | without) e `packaging_filter` (all | with | without)
- Para filtro de embalagem, cruzar com `product_packaging_link`

### 4. Thumbnail nos produtos
- Backend: incluir `thumbnail` no select da `meli_order_items_cache` e retornar no produto
- Frontend: exibir imagem 40x40 ao lado do nome do produto

### 5. Título 60 chars + Variação abaixo do código
- Truncar `display_name` a 60 caracteres visíveis (CSS `max-w-[400px]`)
- Mostrar `variation_id` na segunda linha abaixo do `product_key`, quando existir

### 6. Cache inteligente
- Tudo já usa cache via `useCostModuleCache` -- manter e garantir que filtros/sort fazem parte da cache key

---

## Detalhes Técnicos

### Edge Function `cost-engine` -- `getCatalog`
- Adicionar `thumbnail` ao select: `product_key, item_id, variation_id, sku, title, title_short, thumbnail`
- Aceitar params: `sort_by`, `sort_dir`, `cost_filter`, `packaging_filter`
- Cruzar com `product_packaging_link` para filtro de embalagem e incluir `has_packaging` no retorno
- Sort: aplicar no array completo antes de slice/paginar

### Frontend `CostCatalog.tsx`
- States: `sortBy`, `sortDir`, `costFilter`, `packagingFilter` (substituir `onlyMissing`)
- `handleSaveCost`: após sucesso, atualizar `products` localmente com `setProducts(prev => prev.map(...))`
- Headers da tabela com `onClick` para alternar ordenação
- Barra de filtros: 2 Selects (custo + embalagem) + busca + refresh
- Coluna Produto: thumb (img 40x40) + título (60 chars) + variação + product_key
- Cache key inclui sort e filtros

### Ordem de Execução
1. Atualizar `getCatalog` na edge function (thumbnail, sort, filtros, packaging cross-ref)
2. Reescrever `CostCatalog.tsx` (inline save, sort headers, filtros, thumb, variação)
3. Deploy edge function

