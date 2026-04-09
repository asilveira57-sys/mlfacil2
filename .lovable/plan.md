

# Melhorias no Cabeçalho da Etiqueta de Envio

## Problemas identificados

1. **SKU ausente**: O formato atual é `1x Hélice Espargidor Superior Lava Louça...` — título abreviado e truncado, sem SKU visível, desperdiçando espaço
2. **Carrinho (múltiplos itens)**: Cada produto precisa de linha própria com SKU + quantidade
3. **Nome do cliente fixo na 1ª linha**: Independente da ordem configurada, o nome deve ser sempre a primeira informação
4. **Etiqueta desalinhada**: A etiqueta original do ML é desenhada na posição `x: 0, y: 0` (canto inferior esquerdo da página), ficando encostada na borda direita em vez de centralizada
5. **Código cortado**: Quando a etiqueta fica fora de centro, impressoras podem cortar conteúdo nas bordas

## Correções planejadas

### 1. Incluir SKU na linha de produto
**Arquivo**: `supabase/functions/ml-generate-labels/index.ts` (função `buildProductLines`) e `src/lib/buildHeaderLines.ts`

Formato atual: `1x Hélice Espargidor Superior Lava Louça...`
Formato novo: `1x [SKU] Título do Produto`

Quando o item tem SKU, mostrar: `1x [W11310109] Hélice Espargidor Superior...`
Quando não tem SKU: `1x Hélice Espargidor Superior Lava Louça...` (sem mudança)

Isso aproveita o espaço que sobra ao abreviar o título, inserindo o SKU entre a quantidade e o título.

### 2. Carrinho: uma linha por produto
Alterar `buildProductLines` para que, em vez de concatenar itens na mesma linha com `|`, cada produto ocupe sua própria linha:
```
1x [W11310109] Hélice Espargidor Superior Lava Louça
2x [XYZ-789] Calça Jeans 42
```
O separador `|` será removido. Se houver mais itens do que `max_product_lines`, a última linha continua com `+N itens`.

### 3. Nome do cliente sempre na 1ª linha
Na função `buildHeaderLinesForOrder` (edge function) e `buildHeaderLines` (frontend), forçar que `customer` seja sempre a primeira seção montada, independentemente da ordem configurada em `line_order`. As demais seções seguem a ordem do usuário.

### 4. Centralizar etiqueta na página
**Arquivo**: `supabase/functions/ml-generate-labels/index.ts` (função `buildHeaderPdfSafe`)

Atualmente a etiqueta é desenhada em `x: 0, y: 0`. A página criada tem exatamente o tamanho da etiqueta original + cabeçalho, sem margem para centralização.

Correção: calcular offset X para centralizar a etiqueta original dentro da página, caso a largura da página seja maior que o conteúdo. Se a etiqueta do ML já ocupa 100% da largura, não há o que centralizar — o problema pode ser que a página tem uma largura fixa (ex: A4) e a etiqueta é menor. Vou analisar as dimensões reais do PDF do ML para ajustar.

Na prática, se `origWidth` < largura padrão da folha, adicionar margem simétrica: `xOffset = (pageWidth - origWidth) / 2`.

### 5. Atualizar preview e configurações
**Arquivo**: `src/pages/LabelHeaderSettings.tsx`

- Atualizar `SAMPLE_ITEMS` para mostrar SKU no preview
- Atualizar `generatePreviewLines` para usar o novo formato com SKU
- Adicionar toggle "Exibir SKU" na seção de configurações (nova coluna `show_sku` na tabela `meli_label_header_preferences`)

### 6. Migration: adicionar coluna `show_sku`
Nova coluna `show_sku BOOLEAN DEFAULT true` na tabela `meli_label_header_preferences`.

## Arquivos afetados
- **`supabase/functions/ml-generate-labels/index.ts`** — `buildProductLines`, `buildHeaderLinesForOrder`, `buildHeaderPdfSafe` (SKU, linha por produto, cliente 1º, centralização)
- **`src/lib/buildHeaderLines.ts`** — mesmas mudanças no código frontend (SKU, linha por produto, cliente 1º)
- **`src/pages/LabelHeaderSettings.tsx`** — preview atualizado, toggle show_sku
- **Nova migration SQL** — `ALTER TABLE meli_label_header_preferences ADD COLUMN show_sku boolean DEFAULT true`

## Resultado
- Cabeçalho mostra: `Cliente: MRCIODURO` → `1x [W11310109] Hélice Espargidor...` → `Pedido: 200001590...`
- Carrinho com múltiplos itens: cada um em linha separada com SKU
- Etiqueta centralizada na folha, sem risco de código cortado

