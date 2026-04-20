

## Diagnóstico (do log de produção)

```
2026-04-20T14:09:17Z ERROR CPU Time exceeded   ← lote de 15
2026-04-20T14:09:07Z [labeltest] chunks_total=3 chunk_size=6 total=15
```

**Por que 15 falha no labeltest mas 50 funciona no shipping-labels:**

| Módulo | Pipeline | Custo CPU |
|---|---|---|
| `shipping-labels` (legado) e `ml-generate-labels-v2` | ML → **PDF pronto** → `copyPages` | baixíssimo |
| `ml-generate-labels-labeltest` | ML → ZPL → **Labelary PNG** → `embedPng` → `addPage` por bloco → merge | alto (decode PNG + render pdf-lib por página) |

O labeltest precisa do Labelary porque é o caminho que normaliza a etiqueta para 100×175mm com cabeçalho customizado. Mas para 15 envios são **30 PNGs decodificados e embutidos no mesmo request** — passa do orçamento de CPU do worker (~2s de CPU time, mesmo com wall clock alto).

Não dá pra resolver baixando mais o `CHUNK_SIZE`/`CONCURRENCY` — já está em 6/2, abaixar mais só piora throughput sem resolver o pico de CPU acumulado da função inteira.

ZPL puro (format=zpl) **não tem esse problema** porque pula Labelary e pdf-lib inteiros.

## Correção: processar por chunk em invocações separadas

A mesma técnica que o `ml-generate-labels-v2` usa (batches), porém aproveitando o job `meli_print_queue_v2` que já existe e o poller V2 que já está plugado.

### Mudanças

**1. `supabase/functions/ml-generate-labels-labeltest/index.ts`** — vira **dispatcher**:
- Valida shipments, cria job em `meli_print_queue_v2` com `status='processando'`, `batches=[{idx, sids, status:'pending'}]` (chunks de **5** shipments para PDF; ZPL fica single-shot como hoje).
- Retorna **imediatamente** `{ job_id, total_labels, total_batches }` sem processar.
- Dispara assincronamente `EdgeRuntime.waitUntil(processBatches(jobId))` que invoca a próxima função para cada batch sequencialmente.

**2. Nova `supabase/functions/ml-generate-labels-labeltest-batch/index.ts`** — processa **1 batch só**:
- Recebe `{ job_id, batch_index }`, lê o batch do `meli_print_queue_v2`.
- Faz fetch ZPL → Labelary → pdf-lib **só desses 5 shipments** (cabe folgado no orçamento de CPU).
- Salva o PDF do batch como base64 dentro de `batches[idx].pdf_b64` no job, marca `status='success'` e atualiza `processed_labels`.
- Quando todos os batches terminam, faz o merge final (ainda no worker do último batch ou em finalize separado se passar de 30).

**3. `useShippingLabelsV2.ts`** — adapta o fluxo de geração:
- A `mutationFn` chama `ml-generate-labels-labeltest`, recebe `job_id` e **delega ao poller V2 já existente** (`pollJobUntilDone`) em vez de esperar a resposta síncrona.
- O poller já lê `ml-generate-labels-status-v2` e mostra progresso `processed_labels/total_labels` — vai animar batch a batch automaticamente.
- Ao `status==='completed'`, baixa `pdf_base64` que o `status-v2` já devolve.

**4. `ml-generate-labels-status-v2/index.ts`** — pequeno ajuste:
- Já retorna `processed_labels`, `total_batches`, `completed_batches`. Só precisa também devolver `file_url`/`pdf_base64` quando `status='concluido'` (já lê esses campos da tabela; só garantir que o finalize grava `file_url` ou um campo `pdf_base64`).

**5. Limites:**
- Mantém o limite de **30 etiquetas por geração** (regra de negócio).
- Chunk de 5 → no máximo 6 invocações da função batch, todas dentro do orçamento de CPU.

### Por que não tocar `shipping-labels` nem `ZPL converter`
Já funcionam (PDF direto da ML, sem Labelary). Mantidos intocados.

### Critérios de aceite
- Lote de **15** no labeltest → 15 etiquetas no PDF, sem 546 / sem CPU exceeded.
- Lote de **30** no labeltest → 30 etiquetas no PDF.
- Barra de progresso no UI evolui (5, 10, 15… processed_labels) durante a geração.
- Navegar entre rotas no meio da geração e voltar continua funcionando (recovery V2 já cobre).
- `shipping-labels` e `ml-generate-labels-v2` **não tocados**.
- `format=zpl` continua single-shot (já não tem o problema).

### Escopo de arquivos
- Edita: `supabase/functions/ml-generate-labels-labeltest/index.ts`, `supabase/functions/ml-generate-labels-status-v2/index.ts`, `src/hooks/useShippingLabelsV2.ts`.
- Cria: `supabase/functions/ml-generate-labels-labeltest-batch/index.ts`.
- Sem schema novo (usa colunas `batches`, `pdf_base64`/`file_url`, `processed_labels` já existentes em `meli_print_queue_v2`; se `pdf_base64` não existir, criamos via migration).

**Lovable plan: Aprova?**

