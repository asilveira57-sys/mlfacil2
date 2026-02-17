

# Corrigir 3 Problemas no Modulo de Promocoes

## Problema 1: Erro "Invalid app_version" ao aderir campanhas DEAL

**Causa raiz:** A API do Mercado Livre mudou. Para campanhas tipo DEAL, o codigo atual envia `version: v2` como header HTTP, mas a API agora exige `app_version=v2` como parametro na URL (query parameter), igual ao SMART.

**Logs do erro:**
```
DEAL adhere URL: .../items/MLB5336523970?user_id=1411095727
FAILED: Invalid app_version
```

**Correcao:** No edge function `promotions-action/index.ts`, alterar o endpoint DEAL para usar `?app_version=v2` na URL e remover o header `version`.

```text
// DE (linhas 348-367):
const url = `${baseUrl}/items/${itemId}?user_id=${sellerId}`;
// headers: { 'version': 'v2' }

// PARA:
const url = `${baseUrl}/items/${itemId}?user_id=${sellerId}&app_version=v2`;
// remover header 'version'
```

---

## Problema 2: Apos adesao, pesquisa nao atualiza

**Causa raiz:** O `handlePromotionAction` chama `refetchItems()` e `refetch()` (que atualizam o modal e a lista de promocoes), mas nao re-executa a busca por produto. Resultado: o botao continua mostrando "Participar" em vez de "Participando".

**Correcao:**
1. Adicionar `refetch` ao hook `useProductPromotionSearch` (retornar a funcao `search` para re-execucao manual)
2. No `handlePromotionAction`, apos sucesso, chamar o refetch do product search para atualizar os status dos itens na tela de resultados
3. Manter a query de busca intacta (nao limpar o campo de pesquisa)

**Arquivo:** `src/hooks/useProductPromotionSearch.ts`
- Expor uma funcao `refetch` na interface de retorno

**Arquivo:** `src/pages/Promocoes.tsx`
- Capturar o `refetch` do hook de product search
- Chamar no `handlePromotionAction` apos sucesso

---

## Problema 3: Filtro "Co-participacao ML" nao funciona

**Causa raiz:** A query que busca `raw_item_data` em `usePromotions.ts` pode estar sendo limitada pelo limite padrao de 1000 linhas do banco. Esse seller tem 200+ itens participando em multiplas campanhas, o que pode ultrapassar 1000 linhas na tabela `promotion_items_snapshots`. Quando o limite e atingido, muitas campanhas ficam sem dados de `raw_item_data`, logo `hasCoParticipation` fica `false` para todas.

**Correcao:**
- Mudar a query de item statuses para usar paginacao ou uma query mais eficiente que busque apenas o necessario (promotion_id + flag de co-participacao)
- Alternativa mais simples: usar uma query RPC ou filtrar diretamente por `raw_item_data->>'meli_percentage' IS NOT NULL` para contar quais promocoes tem co-participacao, sem precisar carregar todas as linhas

**Arquivo:** `src/hooks/usePromotions.ts`
- Implementar paginacao na query de item statuses (buscar alem do limite de 1000)
- Ou fazer uma query separada e otimizada apenas para detectar co-participacao

---

## Detalhes Tecnicos

### Edge Function - promotions-action/index.ts

```text
// Linha 348-367: Mudar DEAL endpoint
const url = `${baseUrl}/items/${itemId}?user_id=${sellerId}&app_version=v2`;
const body = {
  promotion_id: promotionId,
  promotion_type: promotionType,
};
if (price) body.deal_price = price;

return fetch(url, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    // remover 'version': 'v2'
  },
  body: JSON.stringify(body),
});
```

### useProductPromotionSearch.ts - Adicionar refetch

```text
interface UseProductPromotionSearchResult {
  results: ProductSearchResult[];
  loading: boolean;
  error: string | null;
  refetch: () => void;  // novo
}

// Retornar funcao que re-executa a busca com a query atual
return { results, loading, error, refetch: () => search(query) };
```

### Promocoes.tsx - Chamar refetch apos acao

```text
const { results: productResults, loading: productSearchLoading, refetch: refetchProductSearch } = useProductPromotionSearch(...);

// Dentro de handlePromotionAction, apos sucesso:
await refetchItems();
await refetch();
refetchProductSearch(); // atualizar resultados de busca por produto
```

### usePromotions.ts - Corrigir limite de 1000 linhas

```text
// Buscar item statuses com paginacao para superar limite de 1000
let allItemStatuses: any[] = [];
let from = 0;
const pageSize = 1000;
let hasMore = true;

while (hasMore) {
  const { data } = await supabase
    .from('promotion_items_snapshots')
    .select('promotion_id, item_status, raw_item_data')
    .eq('workspace_id', workspaceId)
    .eq('seller_id', sellerId)
    .range(from, from + pageSize - 1);
  
  if (data) {
    allItemStatuses = allItemStatuses.concat(data);
    hasMore = data.length === pageSize;
    from += pageSize;
  } else {
    hasMore = false;
  }
}
```

### Arquivos Impactados

| Arquivo | Acao |
|---------|------|
| `supabase/functions/promotions-action/index.ts` | Corrigir URL do DEAL para usar `app_version=v2` como query param |
| `src/hooks/useProductPromotionSearch.ts` | Expor funcao `refetch` |
| `src/pages/Promocoes.tsx` | Chamar `refetchProductSearch` apos adesao bem-sucedida |
| `src/hooks/usePromotions.ts` | Paginar query de item statuses para superar limite de 1000 linhas |

