

# Correção: Cabeçalho não renderiza nas etiquetas PDF

## Causa Raiz

O erro nos logs é claro:

```text
Error adding headers to PDF: TypeError: Cannot read properties of undefined (reading 'node')
    at r.embedPages (pdf-lib.mjs)
    at addHeadersToPdf (index.ts:194)
```

Na função `addHeadersToPdf` (linha 243), o código chama a API do pdf-lib incorretamente:

```text
// ERRADO - embedPages espera array de PDFPage, não (PDFDocument, indices)
const [embeddedPage] = await resultPdf.embedPages(sourcePdf, [i]);

// CORRETO - embedPage (singular) recebe um objeto PDFPage
const embeddedPage = await resultPdf.embedPage(sourcePdf.getPage(i));
```

O `try/catch` no bloco de cabeçalho (linha 761) captura o erro e faz fallback silencioso para etiquetas sem cabeçalho. Por isso as etiquetas são geradas, mas sempre no formato padrão.

## Fluxo do erro

```text
  Usuário seleciona "Com Cabeçalho" (mlfacil_100x175_header)
       |
  ML API retorna PDF padrão com sucesso
       |
  addHeadersToPdf() é chamada
       |
  resultPdf.embedPages(sourcePdf, [i])  --> TypeError: 'node' undefined
       |
  catch(headerError) --> "Falling back to labels without headers"
       |
  Retorna PDF original SEM cabeçalho
```

## Correções

### Correção 1: Corrigir chamada da API pdf-lib (CRÍTICA)

**Arquivo:** `supabase/functions/ml-generate-labels/index.ts` (linha 243)

Trocar `embedPages(sourcePdf, [i])` por `embedPage(sourcePdf.getPage(i))`:

```typescript
// ANTES (errado):
const [embeddedPage] = await resultPdf.embedPages(sourcePdf, [i]);

// DEPOIS (correto):
const embeddedPage = await resultPdf.embedPage(sourcePdf.getPage(i));
```

### Correção 2: Migrar import de esm.sh para npm:

**Arquivo:** `supabase/functions/ml-generate-labels/index.ts` (linha 4)

O import do pdf-lib usa `esm.sh` que viola o padrão do projeto e pode causar instabilidade:

```typescript
// ANTES:
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

// DEPOIS:
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
```

### Correção 3: Redeploy da função

Após as correções, a função `ml-generate-labels` será redeployada automaticamente.

---

## Escopo Mínimo

- Apenas 2 linhas alteradas no arquivo da Edge Function
- Nenhum outro módulo impactado
- Nenhuma tabela ou RLS alterada
- Dashboard de vendas, perguntas e demais módulos permanecem inalterados

## Resultado Esperado

- Etiquetas "Com Cabeçalho" renderizam corretamente com nome do cliente, produtos, pedido e observações
- O log mostrará "Headers added successfully" em vez de "Falling back to labels without headers"
- Etiquetas "Padrão ML" continuam funcionando normalmente

