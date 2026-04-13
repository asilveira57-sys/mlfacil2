

# Correção: Remover páginas de lista de separação em TODAS as modalidades

## Diagnóstico

A API do Mercado Livre retorna **3 páginas por envio**: etiqueta (0), DANFE (1), lista de separação (2). O código atual tem dois problemas:

1. **Layout "Padrão ML" (`meli_100x150`)**: a função `mergePDFs` copia TODAS as páginas sem filtrar — inclui a lista de separação.
2. **Layout "Sem NF" (`meli_100x150_no_nf`) via pipeline padrão**: a função `stripDanfePages` assume 2 páginas por envio (pula índices ímpares), mas com 3 páginas por envio, ela mantém a separação (índice 2) e remove a DANFE (índice 1) — resultado errado.
3. **Layout "Com Cabeçalho" (`mlfacil_100x175_header`)**: já está correto — `buildHeaderPdfSafe` copia apenas página 0 e opcionalmente página 1.

## Solução

Arquivo: `supabase/functions/ml-generate-labels/index.ts`

### 1. Criar função `stripExtraPages` inteligente

Substitui `stripDanfePages`. Detecta automaticamente quantas páginas por envio a API retornou (total_pages / num_shipments). Mantém apenas as páginas desejadas de cada grupo:
- **Padrão ML**: mantém páginas 0 e 1 (etiqueta + DANFE), descarta página 2+ (separação)
- **Sem NF**: mantém apenas página 0 (etiqueta), descarta todo o resto

### 2. Aplicar no pipeline padrão (linhas ~1001-1020)

- Após o merge de PDFs do layout `meli_100x150`, chamar `stripExtraPages(merged, shipmentCount, 'standard')` para remover as listas de separação
- Para `meli_100x150_no_nf`, chamar `stripExtraPages(merged, shipmentCount, 'no_nf')` (substitui a atual `stripDanfePages`)

### 3. Remover a função `stripDanfePages` antiga

Será substituída pela nova `stripExtraPages`.

## Resultado esperado

- **Padrão ML**: 10 envios → 20 páginas (etiqueta + DANFE), sem separação
- **Sem NF**: 10 envios → 10 páginas (só etiquetas)
- **Com Cabeçalho**: já funciona corretamente, sem mudança

