
# Modulo Promocoes: Upgrade Completo

## Mudancas Solicitadas

### 1. Aba "Terminando": expandir de 48h para 3 dias
Atualmente o filtro usa 48 horas. Mudar para 72 horas (3 dias) para capturar campanhas como "Impulsione suas vendas" e "Aumente suas vendas" que terminam em 5 dias e nao aparecem hoje, mas aparecerao quando estiverem a 3 dias do fim.

**Arquivo:** `src/hooks/usePromotions.ts` (linha 177)
- Mudar `48 * 60 * 60 * 1000` para `72 * 60 * 60 * 1000`

**Arquivo:** `src/pages/Promocoes.tsx` (linha 423)
- Atualizar label do KPI de "Terminando em 48h" para "Terminando em 3 dias"

### 2. Remover aba "Finalizadas"
Eliminar a aba, o KPI card e os dados relacionados.

**Arquivo:** `src/pages/Promocoes.tsx`
- Remover TabsTrigger "Finalizadas" e TabsContent "finished"
- Remover KPI card "Finalizadas"
- Ajustar grid de KPIs de 5 para 4 colunas

**Arquivo:** `src/hooks/usePromotions.ts`
- Manter `finishedPromotions` no hook (nao quebra nada), mas pode ser removido da interface se desejado

### 3. Busca por produto (cross-promotion)
Quando o usuario buscar por titulo/SKU/MLB na barra principal, alem de filtrar campanhas pelo nome, o sistema tambem buscara em `promotion_items_snapshots` para encontrar itens que correspondem e exibir todas as campanhas onde aquele produto aparece.

**Implementacao:**
- Criar um novo hook `useProductPromotionSearch` que:
  1. Recebe a query de busca, workspaceId e sellerId
  2. Busca em `promotion_items_snapshots` juntando com `meli_listings_cache` por titulo/sku/item_id
  3. Retorna os itens agrupados por produto, com a lista de campanhas de cada um
- Na pagina `Promocoes.tsx`, adicionar uma nova secao abaixo das tabs que aparece quando a busca retorna resultados de produtos
- Cada resultado mostra: thumbnail, titulo, SKU e uma lista de campanhas com botao "Participar" individual

**Arquivos:**
- Novo: `src/hooks/useProductPromotionSearch.ts`
- Editar: `src/pages/Promocoes.tsx` (adicionar secao de resultados por produto)

### 4. Filtro de campanhas com co-participacao ML (reducao de tarifa)
Adicionar um novo filtro na barra de filtros para mostrar apenas campanhas que tem itens com `meli_percentage > 0` (co-financiadas pelo ML com reducao de tarifa).

**Implementacao:**
- Na query de item counts do hook `usePromotions`, tambem contar quantas promocoes tem pelo menos 1 item com `raw_item_data->>'meli_percentage'` presente e > 0
- Adicionar um toggle/checkbox "Co-participacao ML" na barra de filtros
- Quando ativo, filtra apenas as promocoes que tem itens co-financiados
- Exibir um icone verde ao lado do nome da campanha na tabela quando ela tem co-participacao

**Arquivos:**
- Editar: `src/hooks/usePromotions.ts` (buscar flag de co-participacao por promocao)
- Editar: `src/pages/Promocoes.tsx` (adicionar filtro e indicador visual)

---

## Detalhes Tecnicos

### Hook usePromotions.ts - Mudancas

```text
// 1. Terminando: 48h -> 72h
const hours72FromNow = new Date(now.getTime() + 72 * 60 * 60 * 1000);

// 2. Na query de item statuses, tambem buscar meli_percentage
const itemStatusesResult = await supabase
  .from('promotion_items_snapshots')
  .select('promotion_id, item_status, raw_item_data->meli_percentage')
  .eq('workspace_id', workspaceId)
  .eq('seller_id', sellerId);

// 3. Ao agrupar, marcar quais promocoes tem co-participacao
// Adicionar campo hasCoParticipation ao PromotionItemCounts
```

Interface atualizada:
```text
export interface PromotionItemCounts {
  participating: number;
  eligible: number;
  hasCoParticipation: boolean; // novo
}
```

### Hook useProductPromotionSearch.ts - Novo

```text
// Busca em promotion_items_snapshots + meli_listings_cache
// por titulo, sku ou item_id
// Agrupa resultados por item_id
// Para cada item, lista as promocoes onde aparece

interface ProductSearchResult {
  item_id: string;
  title: string | null;
  thumbnail: string | null;
  sku: string | null;
  promotions: {
    promotion_id: string;
    promotion_name: string | null;
    promotion_type: string;
    status: string;
    item_status: string;
    meli_percentage: number | null;
    offer_id: string | null;
    original_price: number | null;
    promo_price: number | null;
    feeReductionAmount: number | null;
  }[];
}
```

A busca so dispara apos 3+ caracteres digitados e com debounce de 500ms para nao sobrecarregar.

### Pagina Promocoes.tsx - Mudancas

1. **Barra de filtros**: adicionar checkbox "Co-participacao ML" com icone verde
2. **Secao de resultados por produto**: aparece abaixo da barra de busca quando ha resultados de produto
   - Card para cada produto com thumbnail, titulo, SKU
   - Dentro do card, tabela compacta com campanhas disponiveis
   - Cada linha tem: nome da campanha, tipo, desconto, reducao de tarifa, botao "Participar"
3. **Tabela de promocoes**: adicionar icone verde ao lado do nome quando `hasCoParticipation = true`
4. **KPI grid**: de 5 para 4 colunas (remocao de Finalizadas)

### Impacto nos Arquivos

| Arquivo | Acao |
|---------|------|
| `src/hooks/usePromotions.ts` | 48h->72h, buscar meli_percentage, flag co-participacao |
| `src/hooks/useProductPromotionSearch.ts` | Novo hook de busca por produto cross-promotion |
| `src/pages/Promocoes.tsx` | Remover Finalizadas, filtro co-participacao, secao produto, label 3 dias |
