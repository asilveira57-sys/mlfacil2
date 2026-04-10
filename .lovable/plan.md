

# Corrigir Estrutura do PDF "Com Cabeçalho" — Eliminar Páginas de Separação Individuais

## Problema

O PDF da API do Mercado Livre retorna **3 páginas por envio**: etiqueta, DANFE e uma "lista de separação" do ML. O código atual copia TODAS as páginas após a etiqueta como se fossem DANFE (linhas 344-351), resultando em:

- Página 1: Etiqueta + Cabeçalho ✓
- Página 2: DANFE ✓
- **Página 3: Lista de separação do ML** ✗ (indesejada, individual por pedido)

Para 12 vendas, gera 36 páginas + separação custom = 37. O correto seria 24 + 1 = 25 (ou 24 sem separação).

## Correção

### 1. Limitar cópia a apenas 1 página extra (DANFE)

Na função `buildHeaderPdfSafe`, substituir a lógica que copia TODAS as páginas extras (linhas 344-351) por uma que copia **apenas a página 1** (DANFE), ignorando páginas 2+ do ML (listas de separação individuais):

```typescript
// ANTES: copia TUDO após página 0
if (pageCount > 1) {
  const danfeIndices = Array.from({ length: pageCount - 1 }, (_, i) => i + 1);
  ...
}

// DEPOIS: copia SOMENTE página 1 (DANFE), ignora página 2+ (separação ML)
if (pageCount > 1) {
  const [danfePage] = await resultPdf.copyPages(sourcePdf, [1]);
  resultPdf.addPage(danfePage);
}
```

### 2. Remover envio do relatório de separação

O relatório de separação custom (`separation_pdf_base64`) será removido do fluxo. O usuário confirmou que não é útil e pode corromper o resultado. Remover:
- No frontend (`useShippingLabels.ts`): eliminar a geração de `buildSeparationReportPdf` e o envio de `separation_pdf_base64`
- Na edge function: remover o parâmetro e o bloco de append (linhas 370-389)

## Resultado

Para 12 vendas: **24 páginas** (12 etiquetas + 12 DANFEs), sem nenhuma lista de separação individual ou acumulada.

Estrutura limpa: Pág 1 = Etiqueta, Pág 2 = NF, Pág 3 = Etiqueta, Pág 4 = NF...

## Arquivos afetados
- **`supabase/functions/ml-generate-labels/index.ts`** — limitar cópia a 1 página DANFE, remover append de separação
- **`src/hooks/useShippingLabels.ts`** — remover geração e envio de `separation_pdf_base64`

