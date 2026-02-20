

## Melhorar Qualidade e Aproveitamento do Cabecalho nas Etiquetas

### Problema Atual

1. **Titulo truncado**: O texto do produto esta limitado a 25 caracteres por item e 45 caracteres por linha. Com 100mm de largura (~283pt), usando fonte de 8pt (~4.5pt por caractere), cabem facilmente 55-60 caracteres por linha. Estamos desperdicando quase metade do espaco disponivel.

2. **Qualidade de impressao**: A linha separadora tem espessura de apenas 0.5pt, o texto usa cor cinza (0.1, 0.1, 0.1) em vez de preto puro, e apenas a primeira linha esta em negrito. Em impressoras termicas de 203dpi, linhas finas e texto leve ficam quase invisiveis.

### Solucao

#### 1. Ampliar limites de texto para usar toda a largura

Alterar em **ambos** os arquivos (`buildHeaderLines.ts` e `ml-generate-labels/index.ts`):

- `maxLineLength`: de 45 para 58 caracteres (aproveita ~95% da largura disponivel)
- Truncamento de titulo individual: de 25 para 40 caracteres (permite titulos mais completos)
- Quando houver mais de 1 produto, abreviar para caber na linha (manter logica de agrupamento com `|`)

#### 2. Melhorar qualidade visual da impressao

Alterar no `ml-generate-labels/index.ts` (funcao `addHeadersToPdf`):

- **Todas as linhas em negrito** (usar `fontBold` para todo o texto, nao apenas a primeira linha) - texto em negrito tem tracos mais grossos que imprimem melhor em termicas
- **Cor preta pura**: mudar de `rgb(0.1, 0.1, 0.1)` para `rgb(0, 0, 0)` - maximiza contraste
- **Linha separadora mais grossa**: de 0.5pt para 1.2pt, cor de `rgb(0.6, 0.6, 0.6)` para `rgb(0.2, 0.2, 0.2)` - visivel mesmo em impressao de baixa qualidade
- **Remover tracejado** da linha separadora (usar linha solida) - tracejado fica borrado em 203dpi

#### 3. Ajustar `font_size` padrao

O padrao atual e 8pt. Para impressoras termicas de 203dpi, 9pt oferece melhor legibilidade sem sacrificar espaco. Alterar `DEFAULT_HEADER_PREFS.font_size` de 8 para 9 em ambos os arquivos.

### Detalhes Tecnicos

**Arquivos a editar**:
- `src/lib/buildHeaderLines.ts` - limites de texto e font_size padrao
- `supabase/functions/ml-generate-labels/index.ts` - limites de texto, font_size padrao, e qualidade visual do PDF

**Mudancas especificas**:

```text
buildProductLines (ambos arquivos):
  maxLineLength: 45 -> 58
  truncate individual: 25 -> 40

DEFAULT_PREFERENCES / DEFAULT_HEADER_PREFS:
  font_size: 8 -> 9

addHeadersToPdf (edge function):
  Todas as linhas: fontBold (em vez de apenas primeira)
  Cor do texto: rgb(0, 0, 0)
  Linha separadora: thickness 1.2, solid, rgb(0.2, 0.2, 0.2)
```

Essas mudancas sao conservadoras e reversiveis. O vendedor pode ajustar o `font_size` nas preferencias de cabecalho para voltar a 8 ou tentar 10 conforme preferir.
