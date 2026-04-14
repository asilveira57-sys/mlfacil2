

## Permitir Flex + Coleta no mesmo relatório — com NF variável

### Problema real

O `stripExtraPages` assume que **todos os envios têm o mesmo número de páginas** (`totalPages / shipmentCount`). Quando Flex e Coleta são misturados — e considerando que Flex pode ter NF ou não — essa divisão uniforme quebra a sequência do PDF.

O pipeline "Com Cabeçalho" (`buildHeaderPdfSafe`) já funciona corretamente porque processa **cada envio individualmente**, verificando o `pageCount` real de cada PDF retornado pela API do ML.

### Solução

Converter o pipeline "Padrão ML" para processar **por envio individual** (igual ao header), em vez de batch monolítico. Assim, cada envio é tratado com base no seu `pageCount` real.

### Alterações

**1. `src/hooks/useShippingLabels.ts`** — Remover a trava (linhas 933-938)
- Apagar o bloco que impede mistura Flex + Coleta.

**2. `supabase/functions/ml-generate-labels/index.ts`** — Refatorar pipeline padrão

- Criar função `buildStandardPdfPerShipment` que:
  - Itera sobre cada `shipmentId` individualmente
  - Usa `fetchSingleShipmentPdf` (já existe) para baixar o PDF de cada envio
  - Verifica o `pageCount` real do PDF retornado
  - **Layout `meli_100x150` (Padrão ML)**: copia página 0 (etiqueta) + página 1 (DANFE) se existir — ignora página 2+ (lista separação)
  - **Layout `meli_100x150_no_nf` (Sem NF)**: copia somente página 0 (etiqueta)
  - Concatena tudo em um único PDF final
- Substituir o trecho de `processBatchWithRetry` + `stripExtraPages` pelo novo fluxo per-shipment
- Manter delay entre fetches (50ms) para evitar rate limiting

### Sequência resultante (exemplo misto)

```text
Envio 1 (Coleta, 3 páginas ML): [Etiqueta] [DANFE]     ← ignora pág 2
Envio 2 (Flex, 1 página ML):    [Etiqueta]              ← sem DANFE
Envio 3 (Flex, 2 páginas ML):   [Etiqueta] [DANFE]      ← Flex COM NF
Envio 4 (Coleta, 3 páginas ML): [Etiqueta] [DANFE]      ← ignora pág 2
```

Para "Sem NF":
```text
Envio 1: [Etiqueta]
Envio 2: [Etiqueta]
Envio 3: [Etiqueta]
Envio 4: [Etiqueta]
```

### Impacto
- `stripExtraPages` deixa de ser usada para esses layouts (pode ser mantida como fallback)
- Sem alteração de DPI ou dimensões
- Ordem de seleção do usuário preservada
- Performance: individual é mais lento que batch, mas já funciona assim no pipeline header sem problemas

