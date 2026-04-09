
Objetivo: eliminar imediatamente o risco de cabeçalho indo para DANFE/nota fiscal e parar a troca de cabeçalho entre pedidos na geração de etiquetas com cabeçalho.

Diagnóstico confirmado
- O problema não está nos dados do cabeçalho em si. O PDF enviado mostra que o texto do cabeçalho está correto, mas está sendo aplicado na página errada.
- Exemplo do arquivo: a página 1 sai com o cabeçalho de um pedido e a página 2 (DANFE do pedido anterior) já recebe o cabeçalho do próximo pedido.
- A causa raiz está em `supabase/functions/ml-generate-labels/index.ts`:
  - `addHeadersToPdf()` tenta adivinhar se o PDF veio em pares usando `pageCount === shipmentIds.length * 2`
  - se essa conta falha, ele passa a tratar todas as páginas como etiqueta
  - como o cabeçalho é aplicado depois da fusão dos PDFs e mapeado por índice de página, qualquer desvio quebra o alinhamento do arquivo inteiro

Por que isso voltou
- O fluxo atual depende de uma suposição frágil sobre a quantidade de páginas retornadas pelo marketplace.
- Se um lote vier com composição diferente (ex.: mistura de etiqueta + DANFE, páginas extras, comportamento diferente entre lotes), o índice “anda” e o cabeçalho começa a cair em nota fiscal ou em outro pedido.

Correção definitiva
1. Mitigação imediata de segurança
- Desativar temporariamente a geração “Com Cabeçalho” no fluxo atual arriscado, ou bloquear essa opção até o pipeline seguro entrar.
- Manter “Padrão ML” funcionando normalmente para não parar a operação.

2. Reescrever o pipeline do layout com cabeçalho
- No layout `mlfacil_100x175_header`, parar de aplicar cabeçalho sobre o PDF já mesclado.
- Processar cada envio individualmente no backend:
  - baixar o PDF daquele envio
  - aplicar cabeçalho somente na página da etiqueta daquele envio
  - nunca inferir o destino do cabeçalho pelo índice global do PDF consolidado

3. Remover o risco de contaminar DANFE
- O fluxo com cabeçalho deve tratar DANFE como página separada e intocável.
- Implementação segura:
  - ou manter a DANFE sem qualquer modificação
  - ou, de forma ainda mais segura, gerar no arquivo com cabeçalho apenas as páginas de etiqueta
- Minha recomendação: para o modo “Com Cabeçalho”, gerar apenas etiquetas, sem DANFE no mesmo PDF. Isso elimina a classe inteira desse erro.

4. Adicionar travas de segurança
- Se o PDF de um envio vier num formato inesperado, esse envio não entra silenciosamente no arquivo final.
- O sistema deve marcar erro daquele envio/lote e impedir gerar um PDF potencialmente perigoso.

5. Criar regressão para não voltar
- Validar cenários:
  - envio com 1 página
  - envio com 2 páginas (etiqueta + DANFE)
  - vários envios misturados
- Garantir que:
  - nenhuma DANFE receba cabeçalho
  - nenhum cabeçalho fique sem etiqueta
  - nenhum cabeçalho troque de pedido

Arquivos afetados
- `supabase/functions/ml-generate-labels/index.ts` — correção principal do pipeline
- `src/components/shipping/BulkActionsBar.tsx` — mitigação imediata e/ou ajuste do rótulo da opção
- opcionalmente a tela de reimpressão/ações, se for necessário refletir que “Com Cabeçalho” gera somente etiqueta

Detalhes técnicos
- O trecho frágil hoje é:
  - detecção: `pageCount === shipmentIds.length * 2`
  - mapeamento: `shipmentIndex = pagesPerShipment === 2 ? Math.floor(i / 2) : i`
- Esse desenho é perigoso porque assume estrutura perfeita do PDF consolidado.
- O conserto estrutural é trocar mapeamento por índice global por processamento determinístico por envio.

Resultado esperado
- Nunca mais haverá cabeçalho em nota fiscal.
- Nunca mais um cabeçalho será deslocado para outro pedido por quebra de paginação.
- O layout com cabeçalho volta a ser seguro para os clientes operarem sem risco de envio errado.
