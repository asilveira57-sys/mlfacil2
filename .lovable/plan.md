
Correção urgente: etiquetas ZPL da Shopee saindo todas iguais

Diagnóstico
- Eu encontrei a causa no código atual, e você não precisa mandar mais nada para eu corrigir.
- O problema está em `src/hooks/useZPLSettings.ts`, na função `splitShopeeLabels`.
- Hoje ela faz isso:
  1. pega tudo antes do primeiro `^XA` como se fosse um “header” único;
  2. depois separa os blocos `^XA...^XZ`;
  3. reaplica esse mesmo header em todas as etiquetas.
- No arquivo que você enviou, cada etiqueta da Shopee já vem completa e independente, neste formato:
  `~DGR:DEMO.GRF... ^XA ... ^XGR:DEMO.GRF ... ^XZ ^XA ^IDR:DEMO.GRF^FS^XZ`
- Ou seja: cada etiqueta tem seu próprio `~DGR...` com a imagem/arte daquela venda.
- Como o código reaproveita só o `~DGR` da primeira etiqueta em todas as outras, o PDF final repete a primeira etiqueta em todas as páginas. Isso explica exatamente o caso do “Alexandre Nóbrega” repetido.

Solução
1. Reescrever o split da Shopee
- Alterar `splitShopeeLabels` para preservar cada etiqueta completa da Shopee como um bloco fechado.
- Em vez de tratar apenas o primeiro `~DGR` como cabeçalho global, a função vai separar por etiquetas reais, mantendo:
  - o `~DGR` daquela etiqueta;
  - o `^XA...^XZ` de impressão;
  - o `^XA...^XZ` de limpeza (`^IDR:...`) correspondente.

2. Usar estratégia compatível com o arquivo real
- Implementar a extração nesta ordem:
  - primeiro tentar separar por linhas/blocos completos de Shopee (`~DGR...` até o próximo `~DGR...`);
  - validar que cada bloco contém impressão + fechamento;
  - se não bater, usar um fallback seguro.
- Isso evita quebrar outros arquivos antigos enquanto corrige o formato real da Shopee que você mandou.

3. Manter o restante da conversão
- O problema principal não está no loop de geração do PDF.
- Depois que cada bloco vier correto, `ZPLConverter.tsx` pode continuar convertendo etiqueta por etiqueta normalmente.
- Cada request para o conversor externo passará a receber a etiqueta certa, não uma cópia da primeira.

4. Ajustar a contagem de etiquetas
- Garantir que `detectLabelCount` use a nova separação correta.
- Assim o total mostrado na tela e o total de páginas do PDF ficam coerentes com o arquivo real.

5. Validar com o seu arquivo
- Teste obrigatório com `thermal_zpl_shipping_label.txt`.
- Resultado esperado:
  - 26 etiquetas detectadas;
  - PDF com 26 páginas;
  - páginas com destinatários diferentes;
  - a primeira página podendo ser “Alexandre Nóbrega”, mas as demais com os dados corretos de cada venda.

Arquivos afetados
- `src/hooks/useZPLSettings.ts` — correção da lógica de split da Shopee
- `src/pages/ZPLConverter.tsx` — no máximo ajuste leve para usar a nova separação e manter preview/contagem consistentes

Resumo técnico
```text
Erro atual:
arquivo inteiro
  -> pega só o 1º ~DGR
  -> separa por ^XA/^XZ
  -> reaplica o 1º gráfico em todas as páginas

Correto:
cada etiqueta Shopee
  = seu próprio ~DGR
  + seu próprio bloco de impressão
  + seu próprio bloco de limpeza
```

Resultado esperado após a correção
- Shopee deixa de repetir a primeira etiqueta em todas as páginas
- Cada página do PDF passa a refletir a etiqueta real correspondente
- O módulo volta a se comportar como no seu sistema antigo para esse tipo de arquivo
