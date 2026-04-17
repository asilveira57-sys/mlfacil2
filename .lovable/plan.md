
## Plano: 3 alterações no labelTest (sem tocar shipping-labels)

### Alteração 1 — Garantir Etiqueta + DANFE, eliminar página de separação

**Causa raiz:** A ML retorna por shipment um PDF com N páginas — geralmente `[label, DANFE, separação]`. O código atual (linha 538) faz `copyPages(sourcePdf, [1])` cego, assumindo que índice 1 é sempre DANFE. Em algumas contas/coletas, a ML retorna apenas `[label, separação]` (DANFE ainda não emitida no momento da coleta), e o código embute a separação achando que é a NF.

**Fix em `fetchDanfePdf` + bloco DANFE:**
- Buscar o PDF completo da ML (`response_type=pdf`) por shipment.
- Detectar a página DANFE por **heurística de tamanho/aspecto**: DANFE é A4 retrato (~595×842 pt, aspecto ~0.71). Separação ML também costuma ser A4 mas em paisagem ou com proporção distinta. Se houver mais de uma candidata A4-retrato, escolher a primeira.
- Se nenhuma página for compatível com DANFE (PDF tem só label + separação), **logar `DANFE_NOT_AVAILABLE` e seguir SEM anexar separação** (nunca anexar página de separação).
- Quando houver DANFE válida, **sempre anexar** (inclusive em coleta). Remove qualquer condicional que pule DANFE em coleta.
- Log por shipment: `danfe_source_pages`, `danfe_picked_index`, `danfe_w_pt`, `danfe_h_pt`.

### Alteração 2 — Variação no cabeçalho

**Causa raiz:** A query `meli_order_items_cache` (linha 459) busca por `order_id` mas **não filtra por `seller_id`** e não confirma que `variation_attributes` veio populado. Em workspaces multi-conta o item correto pode não estar sendo retornado, e o cache pode ter `variation_attributes = null` mesmo havendo variação.

**Fix:**
- Adicionar `.eq('seller_id', seller_id)` na query de items.
- No `buildProductLines`, se `variation_attributes` estiver vazio/null, fazer fallback para extrair a variação do `title` quando contiver padrão " - Cor: X / Tamanho: Y" (já vem assim em alguns retornos da ML).
- Forçar `show_variation_attrs = true` por padrão no labelTest (não depender de preferência do usuário) — alinhado com o engine legado que sempre mostra variação.

### Alteração 3 — Lotes de 10 etiquetas+DANFE, merge final

**Objetivo:** Permitir 30+ etiquetas por requisição respeitando limites do Labelary (~2MB) e CPU do edge runtime.

**Implementação:**
- Após validação dos shipments, dividir `validIds` em **chunks de 10**.
- Para cada chunk, executar o pipeline atual (ZPL → Labelary PNG → pdf-lib + DANFE) e gerar **um `PDFDocument` parcial**.
- Manter um array `chunkPdfs: Uint8Array[]` com o `.save()` de cada bloco.
- Entre chunks: `await new Promise(r => setTimeout(r, 0))` (yield CPU) + `await sleep(300)` (folga rate-limit Labelary).
- Erros num chunk não derrubam os demais — registrar `chunk_index` no `perShipmentLog`.
- **Merge final:** criar `finalPdf = PDFDocument.create()`, `copyPages` de cada chunkPdf na ordem, salvar uma vez só.
- Cada chunkPdf é descartado após o merge (libera memória).
- Telemetria nova: `chunks_total`, `chunks_ok`, `bytes_per_chunk[]`.

**Capacidade alvo:** 30–35 etiquetas (60–70 páginas com DANFE) por requisição, sem CPU timeout.

### Critérios de aceite
- Coleta com NF emitida → sai etiqueta + DANFE em todos shipments, **zero** página de separação.
- Coleta sem NF emitida → sai apenas etiqueta, log `DANFE_NOT_AVAILABLE` por shipment.
- Cabeçalho mostra "Cor: Azul" / "Tamanho: M" quando o item tem variação.
- Lote de 30 etiquetas conclui sem CPU exceeded.
- `shipping-labels` permanece intocado.

### Escopo
- 1 arquivo: `supabase/functions/ml-generate-labels-labeltest/index.ts`.
- Sem mudanças de schema, frontend ou no módulo legado.
