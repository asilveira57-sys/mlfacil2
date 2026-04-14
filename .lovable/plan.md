
Diagnóstico confirmado

O problema mais provável agora não é “uma opção quebrada”, e sim uma regressão de regra:

1. A UI passou a decidir tudo com um único booleano: `hasOrdersWithoutNf`
   - Arquivos: `src/pages/ShippingLabels.tsx` e `src/components/shipping/BulkActionsBar.tsx`
   - Isso simplificou demais uma regra que na prática depende de:
     - `logistic_type`
     - `invoice_status`
     - `label_available`
     - layout escolhido
   - Resultado: o dropdown desabilita `Padrão ML` e `Com Cabeçalho` em bloco, mesmo quando a seleção deveria ter outra permissão.

2. O sistema ainda está com regras espalhadas
   - `BulkActionsBar` usa uma regra
   - `ShippingLabels.tsx` usa outra
   - `OrderDetailsDrawer.tsx` usa outra
   - `ml-generate-labels` usa outra no backend
   - Isso explica o “cada mexida quebra outra”.

3. A captura enviada confirma a regressão visual/funcional
   - O menu PDF está sendo guiado só pelo estado “tem NF ou não”
   - Mas o comportamento correto precisa distinguir Flex, Coleta/Cross-docking e layout escolhido

Plano de correção definitiva

1. Centralizar a regra de impressão em um único helper compartilhado
- Criar uma função única para calcular compatibilidade por pedido/seleção:
  - Flex: liberar os 3 layouts
  - Coleta/Cross-docking sem NF: liberar apenas `Somente Etiquetas de envio` e `ZPL`
  - Coleta/Cross-docking com NF: liberar os 3 layouts compatíveis
  - Full: manter bloqueio
- Essa função deve devolver:
  - layouts permitidos
  - layouts bloqueados
  - motivo do bloqueio por layout

2. Trocar o booleano `hasOrdersWithoutNf` por uma matriz real de capacidades
- Arquivos:
  - `src/pages/ShippingLabels.tsx`
  - `src/components/shipping/BulkActionsBar.tsx`
- Em vez de “tem pedido sem NF = bloqueia tudo”, calcular:
  - `canUseStandardPdf`
  - `canUseHeaderPdf`
  - `canUseNoNfPdf`
  - `canUseZpl`
- Mostrar motivo correto no menu:
  - `requer NF`
  - `indisponível para Full`
  - `permitido apenas para etiqueta`

3. Unificar a reimpressão individual com a mesma regra
- Arquivos:
  - `src/components/shipping/OrderDetailsDrawer.tsx`
  - `src/pages/ShippingLabels.tsx`
- Hoje a reimpressão individual ainda está parcial.
- Ajustar para:
  - não forçar sempre `PDF Padrão`
  - permitir `Somente Etiquetas de envio` quando for o caso
  - permitir Flex sem NF em PDF e ZPL
  - manter o mesmo comportamento da barra em lote

4. Alinhar o backend à mesma matriz
- Arquivo: `supabase/functions/ml-generate-labels/index.ts`
- Reaplicar a regra no backend com a mesma lógica central do produto:
  - Flex não exige NF
  - `meli_100x150_no_nf` e `zpl` podem sair sem NF quando a etiqueta existir
  - `meli_100x150` e `mlfacil_100x175_header` exigem NF apenas para não-Flex
- Garantir mensagens de erro específicas por envio/layout, sem bloqueio confuso

5. Revisar a classificação operacional da listagem
- Arquivo potencial: função `get_shipping_orders` nas migrations do backend
- Confirmar se `ready_for_pickup` / `in_packing_list` devem aparecer como:
  - `Para imprimir`
  - ou `Reimprimir`
- O importante é a compatibilidade de impressão seguir a regra central, não o nome da aba

6. Validação obrigatória antes de fechar
- Testar com cenários reais:
  1. Flex sem NF → os 3 layouts devem funcionar
  2. Flex com NF → os 3 layouts devem funcionar
  3. Coleta sem NF → `Somente Etiquetas de envio` e `ZPL` funcionam; os outros bloqueiam
  4. Coleta com NF → os 3 layouts funcionam
  5. Full → continua bloqueado
  6. Reimpressão individual e em lote com a mesma regra
- Validar especificamente a conta `engenharia@megatools.com.br`

Arquivos que eu alteraria
- `src/pages/ShippingLabels.tsx`
- `src/components/shipping/BulkActionsBar.tsx`
- `src/components/shipping/OrderDetailsDrawer.tsx`
- `src/hooks/useShippingLabels.ts`
- `supabase/functions/ml-generate-labels/index.ts`
- possivelmente uma nova utilidade compartilhada, por exemplo `src/lib/shippingLabelRules.ts`
- possivelmente a função `get_shipping_orders` se a classificação de aba estiver incoerente

Detalhe técnico importante
- O conserto definitivo não é mais “ajustar mais um if”.
- É remover a lógica espalhada e colocar uma única fonte de verdade para permissão de impressão.
- Sem isso, qualquer ajuste em Flex vai continuar quebrando Coleta, e vice-versa.
