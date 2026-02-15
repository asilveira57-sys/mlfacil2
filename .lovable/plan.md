
# Correcao da Central de Promocoes: Adesao, Layout e Dados Visuais

## Problema 1: Adesao falhando para todos os 18 itens

**Causa raiz identificada nos logs:**
```
Resource /seller-promotions/promotions/P-MLB16555022/items/MLB3389129181 not found.
```

O endpoint da API esta errado. Para promocoes do tipo **SMART**, a API do Mercado Livre usa uma URL diferente:

- **Errado (atual):** `POST /seller-promotions/promotions/{promo_id}/items/{item_id}?promotion_type=SMART`
- **Correto:** `POST /seller-promotions/items/{item_id}?app_version=v2` com body contendo `promotion_id`, `promotion_type` e `offer_id`

Alem disso, cada item SMART requer um `offer_id` unico (ex: `CANDIDATE-MLB3389129181-75059206804`), que ja esta salvo no campo `raw_item_data` da tabela `promotion_items_snapshots`, mas nao esta sendo enviado ao edge function.

## Problema 2: Janela muito pequena (so mostra 2 itens)

A `ScrollArea` no modal usa `h-[calc(90vh-370px)]`. Com o cabecalho, filtros e toolbar, sobra pouco espaco vertical. Precisa reduzir o padding do cabecalho e aumentar a area util da lista.

## Problema 3: Sem thumbnail, titulo e "Voce recebe"

O hook `useEnrichedPromotionItems` faz um JOIN com `meli_listings_cache`, mas se os itens nao estiverem no cache, retorna null para thumbnail, title, sku, etc. Isso acontece quando os listings nunca foram sincronizados ou o item_id nao corresponde exatamente. O `net_proceeds_amount` ja esta na tabela `promotion_items_snapshots` mas pode estar null se a API do ML nao retornou esse dado na sincronizacao.

---

## Solucao

### Parte 1: Corrigir URL da API de adesao (Edge Function)

**Arquivo:** `supabase/functions/promotions-action/index.ts`

Refatorar a logica de adesao para usar o endpoint correto baseado no `promotion_type`:

- Para **SMART** e **PRICE_MATCHING**: `POST /seller-promotions/items/{item_id}?app_version=v2` com body `{ promotion_id, promotion_type, offer_id }`
- Para **DEAL** e outros: `POST /seller-promotions/items/{item_id}?user_id={seller_id}` com body `{ promotion_id, promotion_type, deal_price }` e header `version: v2`
- Para **remocao (DELETE)**: manter `DELETE /seller-promotions/items/{item_id}?app_version=v2` com body `{ promotion_id, promotion_type }`

Tambem e necessario:
- Adicionar `offer_id` ao interface `ActionItem`
- Buscar o `offer_id` do `raw_item_data` no banco quando nao enviado pelo frontend

### Parte 2: Enviar offer_id do frontend

**Arquivo:** `src/pages/Promocoes.tsx`

Atualizar as callbacks `onAdhere`, `onAdhereAll` e `onAdhereSelected` para incluir o `offer_id` de cada item (extraido de `raw_item_data` via hook, ou buscado diretamente).

**Arquivo:** `src/hooks/useEnrichedPromotionItems.ts`

Expor o campo `offer_id` extraido de `raw_item_data` no tipo `EnrichedPromotionItem` para que o frontend possa envia-lo.

### Parte 3: Aumentar area visivel da lista de itens

**Arquivo:** `src/components/promotions/PromotionDetailModal.tsx`

- Compactar o cabecalho: reduzir padding de `pt-6 pb-3` para `pt-4 pb-2`
- Aumentar a ScrollArea: mudar de `h-[calc(90vh-370px)]` para `h-[calc(90vh-280px)]`
- Isso permitira ver 4-5 itens sem scroll, em vez dos 2 atuais

### Parte 4: Garantir dados visuais (thumbnail, titulo)

**Arquivo:** `src/hooks/useEnrichedPromotionItems.ts`

O hook ja faz o JOIN correto. O problema e que a `meli_listings_cache` pode nao ter os itens. A solucao e:
- Extrair `title` e `price` do `raw_item_data` como fallback quando o listing cache nao tem a informacao
- Adicionar query na coluna `raw_item_data` da `promotion_items_snapshots` para extrair campos como titulo original quando disponivel

Para o "Voce recebe" (`net_proceeds_amount`): o valor ja vem da API na sincronizacao. Se esta null, e porque a API do ML nao retornou esse campo para o tipo SMART. Nesse caso, exibir um calculo estimado baseado nas taxas conhecidas, ou simplesmente manter o "-" com tooltip explicativo.

---

## Detalhes Tecnicos

### Mudanca na Edge Function (`promotions-action/index.ts`)

```text
Interface ActionItem atualizada:
  item_id: string
  price?: number
  offer_id?: string   // NOVO

Logica de URL por tipo:
  SMART / PRICE_MATCHING:
    POST /seller-promotions/items/{item_id}?app_version=v2
    Body: { promotion_id, promotion_type, offer_id }

  DEAL:
    POST /seller-promotions/items/{item_id}?user_id={seller_id}
    Headers: version: v2
    Body: { promotion_id, promotion_type, deal_price: price }

  DELETE (todos):
    DELETE /seller-promotions/items/{item_id}?app_version=v2
    Body: { promotion_id, promotion_type }

Fallback: se offer_id nao vier no request, buscar de raw_item_data no banco
```

### Campo offer_id no EnrichedPromotionItem

```text
Extrair de raw_item_data no hook:
  const rawData = item.raw_item_data as Record<string, unknown> | null;
  const offerId = rawData?.offer_id as string | null;

Adicionar ao tipo:
  offer_id: string | null
```

### Impacto nos arquivos

| Arquivo | Acao |
|---------|------|
| `supabase/functions/promotions-action/index.ts` | Corrigir URL da API por tipo de promocao; adicionar offer_id |
| `src/hooks/useEnrichedPromotionItems.ts` | Expor offer_id; fallback de title via raw_item_data |
| `src/pages/Promocoes.tsx` | Enviar offer_id nas callbacks de adesao |
| `src/components/promotions/PromotionDetailModal.tsx` | Compactar header; aumentar ScrollArea |

### Resultado esperado

- Adesao SMART funciona corretamente usando o endpoint e offer_id corretos
- Lista mostra 4-5 itens visiveis (em vez de 2)
- Thumbnails e titulos aparecem via cache ou fallback do raw_item_data
