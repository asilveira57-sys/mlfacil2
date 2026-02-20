

## Correções na Tela de Etiquetas de Envio

### 1. Ajustar layout para caber na tela sem barra de rolagem

**Problema**: A página usa `container mx-auto px-4 py-6 space-y-6` com espaçamentos generosos, fazendo com que o conteúdo ultrapasse a viewport.

**Solucao**: Reduzir paddings/margins e usar `h-[calc(100vh-...)]` na area da tabela para que ela se ajuste ao espaço disponível sem precisar de scroll externo. A tabela interna terá seu próprio scroll vertical.

**Arquivos**: `src/pages/ShippingLabels.tsx`, `src/components/shipping/ShippingTable.tsx`

---

### 2. Corrigir a Barra de Progresso (0% -> 100% sem intermediário)

**Problema**: A geração de etiquetas faz uma unica chamada `supabase.functions.invoke('ml-generate-labels')` que retorna somente quando tudo termina. O progresso é setado para `processing` com 0 batches completos, e depois pula direto para `completed`. Não há polling intermediário - a barra fica em 0% até receber a resposta completa.

**Solucao**: Para etiquetas com 1 lote (maioria dos casos, < 50 etiquetas), a barra de progresso não faz sentido pois é tudo-ou-nada. A solução é:
- Para 1 lote: mostrar um spinner simples com texto "Gerando etiqueta(s)..." em vez da barra de progresso
- Para multiplos lotes: usar uma animação de progresso indeterminado (barra pulsante) já que não temos feedback intermediário real do servidor

**Arquivos**: `src/components/shipping/LabelGenerationProgress.tsx`

---

### 3. Exibir título do produto na etiqueta (não apenas SKU)

**Problema**: Na funcao `buildProductLines` (tanto em `src/lib/buildHeaderLines.ts` quanto em `supabase/functions/ml-generate-labels/index.ts`), a linha 117 faz:
```
const text = truncate(item.sku || item.title_short || item.title || 'Item', 25);
```
Isso prioriza SKU sobre título. A pré-visualização na página de configurações mostra o título (ex: "3x Meia Preta | 2x ABC-123"), mas na impressão real sai apenas o SKU (ex: "1x RM110X74KUDO").

**Solucao**: Inverter a prioridade para `title_short || title || sku || 'Item'`, mantendo o SKU como fallback. Isso alinha a impressão com a pré-visualização. Alterar em ambos os arquivos (frontend buildHeaderLines e edge function).

**Arquivos**: `src/lib/buildHeaderLines.ts`, `supabase/functions/ml-generate-labels/index.ts`

---

### 4. Exibir o mesmo numero de venda que o Mercado Livre

**Problema**: O sistema exibe o `order_id` (ex: `2000015181033942`), mas o Mercado Livre mostra um numero diferente no painel de vendas (ex: `#200001159687436​5`). O numero do ML é o `pack_id` do pedido. Quando o vendedor precisa conferir uma etiqueta, os numeros não batem.

**Análise dos dados**: A tabela `meli_orders_cache` atualmente não tem coluna `pack_id`. O `pack_id` vem da API do ML no campo `pack_id` do objeto Order. Precisamos:

a) Adicionar coluna `pack_id` na tabela `meli_orders_cache`
b) Popular essa coluna durante a sincronizacao de pedidos (edge function de sync)
c) Exibir `pack_id` (quando existir) no lugar de `order_id` na tabela e na etiqueta
d) Na etiqueta impressa, usar `pack_id || order_id` no campo "Pedido:"

**Arquivos**: 
- Migração SQL para adicionar coluna `pack_id`
- `src/components/shipping/ShippingTable.tsx` - exibir pack_id
- `src/lib/buildHeaderLines.ts` - usar pack_id na etiqueta
- `supabase/functions/ml-generate-labels/index.ts` - usar pack_id na etiqueta
- Edge function de sync de pedidos (para popular o campo)

### Detalhes Tecnicos

**Ordem de execução**:
1. Migração SQL: `ALTER TABLE meli_orders_cache ADD COLUMN pack_id text;`
2. Atualizar edge function de sync para salvar pack_id
3. Corrigir prioridade SKU/titulo em buildProductLines (2 arquivos)
4. Ajustar layout da página (reduzir espaçamento, scroll na tabela)
5. Melhorar barra de progresso (spinner para 1 lote)
6. Exibir pack_id na tabela e na etiqueta

**Nota sobre pack_id**: Pedidos que já estão no cache não terão pack_id preenchido até a próxima sincronização. Para popular retroativamente, seria necessário um re-sync dos pedidos ou um script de backfill.

