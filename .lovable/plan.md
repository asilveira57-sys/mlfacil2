## Problema

O arquivo tem 96 blocos `^XA…^XZ`, mas cada bloco contém uma diretiva `^PQn,0,1,Y` indicando quantas cópias daquela etiqueta devem ser impressas. A soma dos `^PQ` = **221** (confirmado).

O sistema atual (`splitFullLabels` em `src/hooks/useZPLSettings.ts`) apenas divide por `^XA` e retorna **96** etiquetas, ignorando completamente o `^PQ`. Por isso o painel mostra "96 etiquetas detectadas" e o PDF gerado também sai com 96 páginas. O sistema antigo (mlfacil) expandia o `^PQ`, por isso gerava as 221.

## Correção

Ajustar **`splitFullLabels`** (usado por Full Produto, Full Volume, Mercado Livre e Magalu) para:

1. Após dividir por `^XA…^XZ`, ler a quantidade do `^PQn,...` de cada bloco (default = 1 se ausente).
2. Replicar o bloco `n` vezes no array de saída.
3. Em cada cópia replicada, normalizar a diretiva para `^PQ1,0,1,Y` (ou remover) para que o Labelary não multiplique novamente em cima da replicação.
4. Manter o comportamento atual quando não houver `^PQ` (1 cópia por bloco).

Nenhuma outra mudança é necessária:
- `detectLabelCount` já chama `splitZPLByType` quando recebe `labelType`, então o contador no painel passará automaticamente a mostrar 221.
- O loop de conversão em `ZPLConverter.tsx` itera sobre o array retornado, então gerará as 221 páginas.
- Shopee continua com sua própria lógica (`splitShopeeLabels`), sem impacto.

## Arquivo alterado

- `src/hooks/useZPLSettings.ts` — função `splitFullLabels` (expansão de `^PQ` + normalização para `^PQ1`).

## Validação

- Recarregar o mesmo arquivo `Envio-69023601-Etiquetas-de-produtos (2).txt` → painel deve mostrar **221 etiquetas detectadas**.
- Converter para PDF → arquivo deve ter **221 páginas**, na ordem original e com as repetições corretas (ex.: EUGB80550 aparecendo 2× consecutivas, SMAS45837 3×, etc.).
- Testar um arquivo sem `^PQ` para confirmar que continua 1 cópia por bloco.