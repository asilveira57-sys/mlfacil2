

## Diagnóstico (do log real)

```
errors: 3 shipments × "Labelary retornou 429 após 5 tentativas"
- 46877006857 (blocos #0 e #1)
- 46876109012 (blocos #0 e #1)
- 46876072652 (blocos #0 e #1)
status: 429 = "Request rate limit exceeded" (Labelary)
```

**Não foi erro de NF, não foi erro do ML, não foi erro do seu lote.**

Foi a API pública do **Labelary** (serviço gratuito que converte ZPL → PNG) bloqueando por **rate limit**. Quando paralelizei tudo com `Promise.all` (correção da "CPU exceeded" anterior), passei a disparar 16 requests simultâneos (8 shipments × 2 blocos). O Labelary gratuito aceita ~5 req/seg — acima disso devolve 429. O retry com backoff (5 tentativas) não adiantou porque todas as tentativas caíram dentro da mesma janela saturada.

Ou seja: troquei um problema (CPU) por outro (rate limit). 5 etiquetas passaram, 3 caíram no 429.

## Correção proposta

**Arquivo único:** `supabase/functions/ml-generate-labels-labeltest/index.ts`

### 1. Concorrência limitada (sem voltar pro sequencial)
- Substituir `Promise.all` por um pool com **limite de 4 requests simultâneos** ao Labelary.
- Mantém ganho de performance (~3–4s por chunk de 10) sem estourar o rate limit.
- Sem CPU exceeded, sem 429.

### 2. Backoff que efetivamente espera
- Hoje o retry tenta de novo quase imediatamente. Ajustar para backoff exponencial real: 500ms → 1s → 2s → 4s → 8s.
- Em 429 especificamente, respeitar `Retry-After` se vier no header.

### 3. Rede de segurança: fila de retry pós-chunk
- Ao final de cada chunk, juntar shipments que falharam **só por 429** numa segunda passada serial (1 req por vez, 250ms entre cada).
- Isso garante que 429 transitório nunca aborte uma etiqueta — só aborta se ML não tiver o ZPL.

### 4. Telemetria mais clara no resumo
- Separar `error_count` por categoria: `rate_limit`, `danfe_missing`, `ml_api_error`, `other`.
- Hoje todos viram "LABELARY_CONVERSION_FAILED" — você não consegue distinguir falha de infra de falha de regra.

### Critérios de aceite
- Lote de 8 etiquetas → 8 etiquetas no PDF.
- Zero falhas por 429 em lotes de até ~30 shipments.
- Se uma falha real ocorrer (ML sem ZPL), aparece no resumo com motivo correto.
- `shipping-labels` (produção) intocado.

### Escopo
- 1 arquivo. Sem schema, sem frontend.

