## Diagnóstico

Os três módulos (Ship Label PDF, Ship Label V2, Label Teste) compartilham a mesma lógica de cabeçalho:
- `buildHeaderLines / buildHeaderLinesForOrder` já suportam `variation_attributes` e `order_comment`.
- `meli_orders_cache.order_comment` é populado pelo `ml-sync-orders` (linha 434: `order.comments`).

**O que está funcionando hoje:**

| Módulo | Função edge | Variação | Observação | Enriquecimento ML |
|---|---|---|---|---|
| Label Teste | `ml-generate-labels-labeltest-batch` | ✅ | ✅ | ✅ via `fetchVariationAttributesMap` |
| Ship Label V2 | `ml-generate-labels-v2` | ⚠️ só do cache | ✅ | ❌ |
| Ship Label PDF (legado) | `ml-generate-labels` | ⚠️ só do cache | ✅ | ❌ |

**Causa raiz:** o cache `meli_order_items_cache.variation_attributes` está vazio para a maioria dos pedidos (sync só preenche quando o item já é resolvido). O Label Teste resolve isso chamando `/items?attributes=variations` em runtime; o Ship Label não — então a variação some do cabeçalho. Além disso, `ml-generate-labels-labeltest-batch` força `show_variation_attrs = true` (linha 152) — Ship Label respeita a preferência salva e pode estar `false` para alguns sellers.

A "observação da venda" já é lida e formatada corretamente nos três (campo `order_comment`, prefixado com `Obs:`). Se não está saindo, é apenas porque a preferência `show_comment` está desligada para o seller — não há bug, mas vamos forçar paridade entre módulos.

## Mudanças

### 1. `supabase/functions/ml-generate-labels-v2/index.ts`
- Importar `fetchVariationAttributesMap` de `_shared/labeltest-render.ts` (ou duplicar inline se o shared não estiver acessível ao bundle do v2).
- Após carregar `itemsData` (linha 228), filtrar itens com `item_id` + `variation_id` cuja `variation_attributes` esteja vazia, chamar `fetchVariationAttributesMap` com `mlAccount.access_token` e mesclar antes de `buildHeaderLines`.
- Forçar `prefs.show_variation_attrs = true` e `prefs.show_comment = true` antes de montar o header (paridade com Label Teste).
- Selecionar também `item_id, variation_id` no query de items.

### 2. `supabase/functions/ml-generate-labels/index.ts`
- Mesma alteração no bloco 940–1010:
  - Adicionar `item_id, variation_id` ao select de `meli_order_items_cache`.
  - Aplicar o mesmo enriquecimento on-the-fly via `fetchVariationAttributesMap` antes de `buildHeaderLinesForOrder`.
  - Forçar `prefs.show_variation_attrs = true` e `prefs.show_comment = true`.

### 3. `supabase/functions/_shared/labeltest-render.ts`
- Nenhuma mudança funcional — apenas confirmar que `fetchVariationAttributesMap` está exportado para reuso (caso já esteja, importar direto; caso contrário, exportar).

## O que não muda

- Layout, fontes, ordem das linhas, máximos por seção.
- Preferências do seller (`meli_label_header_preferences`) continuam respeitadas — apenas `show_variation_attrs` e `show_comment` ficam ligados em runtime para todos os módulos de etiqueta.
- Sync de pedidos (`ml-sync-orders`) — sem alterações.
- Frontend — sem alterações.

## Validação

- Após deploy, gerar uma etiqueta no Ship Label (V2) para um pedido com variação (cor/tamanho) e com observação do comprador. Conferir no PDF que ambas as linhas aparecem no cabeçalho, idênticas ao Label Teste.
- Conferir logs `[HEADER]` para garantir que `headerDataMap.size` cobre todos os shipments.
