

## Diagnóstico (4 problemas, todos confirmados em log/DB)

### 1) Variação não aparece no cabeçalho
- 97.385 linhas em `meli_order_items_cache` têm `variation_attributes = NULL` (legado, antes do sync passar a popular).
- O sync novo **popula corretamente** (`ml-sync-orders` linhas 376-387), mas pedidos antigos não foram retro-preenchidos.
- O fallback `extractVariationsFromTitle` só pega títulos terminados em `Cor: Azul`, que quase nenhum tem.

### 2) Geração extremamente lenta (≈32s para 15 etiquetas)
- Log do worker: cada batch leva ~10s. `triggerBatchWorkers` chama os 3 batches **estritamente sequencial** (`await` em série + `sleep(500)` entre cada). Total: 10+10+10+1.5 ≈ 32s.
- Não é necessário sequencial — Labelary aguenta 2 workers em paralelo (cada worker já roda 2 PNGs concorrentes).

### 3) Arquivo dividido em 2
- Job `87b970f9`: 14/15 sucessos (1 falha 429), gerou PDF parcial. Status `parcial` faz `handleGenerationComplete` baixar o PDF.
- Como o estado se perde ao navegar (problema 4), o usuário gera de novo → recebe segundo PDF com os mesmos. Resultado prático: 2 PDFs.
- Causa raiz é o problema 4 + ausência de "anti-duplo-disparo" enquanto há job ativo.

### 4) Perde o arquivo ao mudar de guia (CRÍTICO)
- Bug confirmado em `useShippingLabelsV2.ts` linhas 282-290:
  ```
  if (data.file_url) { handleGenerationComplete(...) }   ← V2 não usa file_url
  else { finalizeJob(status) }                            ← NÃO baixa o PDF
  ```
- V2 grava `pdf_base64` (não `file_url`). Quando o poll é abortado pela navegação e reinicia no remount com job já `concluido`, cai no `else` e perde o download.
- Confirmado: `meli_print_queue_v2` tem `pdf_base64` populado (2.8MB), `file_url` sempre nulo.

## Correção (4 arquivos, sem schema)

### A) `useShippingLabelsV2.ts` — fix do recovery (resolve #3 e #4)
1. No `pollJobUntilDone`, trocar a condição:
   ```
   if (isTerminalStatus(status)) {
     if (data.pdf_base64 || data.zpl_content || data.file_url) {
       handleGenerationComplete(data, format);
     } else {
       finalizeJob(status as any);
     }
   }
   ```
2. No bloco de recovery on-mount (linhas 183-188), garantir que se `completedData` existir mas o usuário ainda não baixou (ex.: navegou antes do download), refazer o download.
3. Bloquear botão "Gerar etiquetas" enquanto `hasActiveJob` for true (evita gerar 2 PDFs do mesmo lote — passa `disabled={hasActiveJob}` para o `BulkActionsBarV2` ou ignora o disparo no `mutationFn` se já houver job pendente).

### B) `ml-generate-labels-labeltest/index.ts` — paralelismo dos batches (resolve #2)
- Trocar o loop sequencial em `triggerBatchWorkers` por uma janela de **2 workers concorrentes**, mantendo `sleep(250ms)` entre disparos para não saturar Labelary:
  ```
  const CONCURRENT_BATCHES = 2;
  // pool simples: dispara 2, espera o primeiro terminar, dispara o próximo...
  ```
- Resultado esperado para 15 etiquetas: ~16-18s (vs. 32s atual).
- ZPL continua single-shot (sem mudança).

### C) `_shared/labeltest-render.ts` — variação no cabeçalho (resolve #1)
- Em `buildProductLines`, quando `item.variation_attributes` for nulo/vazio, **enriquecer on-the-fly** consultando `meli_listings_cache` por `(seller_id, item_id, variation_id)` e extraindo `attribute_combinations`.
  - Pré-condição: passar um `Map<string, any>` opcional `listingsMap` ou simplesmente um lookup `(item_id, variation_id) → attrs[]` calculado no worker antes de renderizar.
- No worker (`ml-generate-labels-labeltest-batch/index.ts`), adicionar consulta única em `meli_listings_cache` com os `item_id`+`variation_id` do batch e injetar no `orderItemsMap` antes de chamar `renderChunkToPdf`.
- Fallback adicional: se ainda não tiver, manter `extractVariationsFromTitle` atual.

### D) `ml-generate-labels-labeltest-batch/index.ts` — enriquecimento + idempotência
1. Carregar variações de `meli_listings_cache` para os items do batch e mesclar em `orderItemsMap[*].variation_attributes` antes de `renderChunkToPdf`.
2. Garantir que, se o batch já estava `success`, não reprocesse (já tem o guard de `skipped`, ok).
3. No finalize (último batch), garantir que `pdf_base64` é gravado **antes** de marcar `status=concluido` (já está correto, mas validar a ordem do `update`).

## Critérios de aceite
- Lote de 15 etiquetas: PDF único, 15 etiquetas com variação no cabeçalho (quando o produto tiver), ≤ 20s.
- Navegar para outra rota durante a geração e voltar: PDF é baixado automaticamente quando concluído (sem regenerar).
- Tentar clicar "Gerar etiquetas" enquanto há job ativo: botão desabilitado / no-op.
- `shipping-labels` (V1) e `ml-generate-labels-v2` permanecem intocados.

## Escopo
- **Edita**: `src/hooks/useShippingLabelsV2.ts`, `supabase/functions/ml-generate-labels-labeltest/index.ts`, `supabase/functions/_shared/labeltest-render.ts`, `supabase/functions/ml-generate-labels-labeltest-batch/index.ts`.
- **Sem schema novo, sem mexer em V1**.

