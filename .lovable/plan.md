

# Corrigir Pipeline "Com Cabeçalho": Etiqueta + DANFE + Lista de Separação

## Problema
A implementação atual do modo "Com Cabeçalho" descarta todas as páginas de DANFE (linha 316-317 do edge function). O comportamento correto é:
- Página 1 de cada envio: etiqueta **com cabeçalho**
- Página 2+ de cada envio: DANFE **sem cabeçalho**, copiada intacta
- Lista de separação (quando solicitada): última(s) página(s) do PDF final
- Se qualquer envio vier com formato inesperado: **bloquear tudo**, não gerar PDF

## Correções

### 1. Edge function — incluir DANFE sem cabeçalho
**Arquivo:** `supabase/functions/ml-generate-labels/index.ts`

Na função `buildHeaderPdfSafe`, substituir o trecho que pega apenas page 0:
```typescript
// ATUAL (linha 316-318):
// Only take page 0 (the label). Skip any additional pages (DANFE).
const embeddedPage = await resultPdf.embedPage(sourcePdf.getPage(0));
```

Pelo novo comportamento:
- Page 0 → aplicar cabeçalho (como já faz)
- Pages 1..N → copiar intactas no PDF final (são DANFE/notas)
- Se `pageCount === 0` → erro, bloquear tudo (não só pular)

Adicionar validação de segurança: se qualquer envio falhar download ou tiver PDF inválido, retornar erro total em vez de gerar parcial.

### 2. Edge function — aceitar lista de separação no payload
Adicionar parâmetro opcional `separation_pdf_base64` no body da requisição. Se presente, decodificar e anexar como última(s) página(s) do PDF final, após todos os pares etiqueta+DANFE.

### 3. Frontend — gerar separação e enviar junto
**Arquivo:** `src/hooks/useShippingLabels.ts`

No `generateLabelsMutation`, quando o layout for `mlfacil_100x175_header`:
- Gerar o relatório de separação em memória (usando jsPDF como já faz o `exportSeparationReport`)
- Converter para base64
- Enviar no payload como `separation_pdf_base64`

**Arquivo:** `src/utils/exportSeparationReport.ts`
- Extrair uma função `buildSeparationReportPdf()` que retorna o `jsPDF` doc (sem salvar), para poder ser convertido em base64 e enviado ao backend.

### 4. Frontend — atualizar label no dropdown
**Arquivo:** `src/components/shipping/BulkActionsBar.tsx`
- Trocar "só etiquetas" por "etiqueta + NF" no item "Com Cabeçalho"

## Arquivos afetados
- `supabase/functions/ml-generate-labels/index.ts` — incluir DANFE + lista de separação + bloqueio total em erro
- `src/utils/exportSeparationReport.ts` — extrair função reutilizável que retorna PDF em memória
- `src/hooks/useShippingLabels.ts` — gerar separação e enviar no payload do header layout
- `src/components/shipping/BulkActionsBar.tsx` — atualizar label

## Resultado
- Etiqueta com cabeçalho → DANFE sem cabeçalho → próxima etiqueta → próxima DANFE...
- Lista de separação como última folha do mesmo arquivo
- Se qualquer envio falhar, geração é bloqueada inteiramente (sem PDF parcial perigoso)

