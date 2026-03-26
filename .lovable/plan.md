

## Plano: Carregar produtos reais na aba Produtos do módulo Gestão de Frete

### Problema atual
A aba "Produtos" usa dados mock hardcoded (2 produtos fictícios). Precisa carregar os anúncios reais do vendedor, os mesmos que aparecem na Curva ABC, Timeline e Custos.

### Fonte de dados
A tabela `meli_listings_cache` já contém todas as colunas necessárias:
- `item_id`, `title`, `sku`, `thumbnail`, `price`, `status`
- `weight_kg`, `height_cm`, `width_cm`, `length_cm` (dimensões)
- `dimensions_source`, `freight_profile`, `expected_freight_cost`, `logistic_type`

### O que será feito

**1. Criar hook `useFreightProducts`**
- Novo arquivo `src/hooks/useFreightProducts.ts`
- Usa `useActiveAccount()` para obter `sellerId`
- Query na `meli_listings_cache` filtrando por `seller_id`
- Suporta busca por título/SKU/item_id, filtro por status de dimensões e perfil de frete
- Paginação para grandes volumes

**2. Reescrever `FreightProductsTab`**
- Remover mock data
- Integrar com `useFreightProducts`
- Exibir thumbnail do produto
- Filtros funcionais (busca, status dimensões, perfil)
- Contagem real de produtos
- Estados de loading, empty e error

### Colunas exibidas

| Coluna | Campo |
|--------|-------|
| Produto | thumbnail + title + item_id + sku |
| Peso (kg) | weight_kg |
| Dimensões | height_cm × width_cm × length_cm |
| Perfil | freight_profile (A/B/C) |
| Status | baseado em dimensions_source |
| Frete Esperado | expected_freight_cost |
| Ações | Editar / Calcular (mantém botões existentes) |

### Arquivos modificados

| Arquivo | Ação |
|---------|------|
| `src/hooks/useFreightProducts.ts` | Criar - hook de dados |
| `src/components/freight/FreightProductsTab.tsx` | Reescrever - dados reais |

