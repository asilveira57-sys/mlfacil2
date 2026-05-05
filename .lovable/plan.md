Plano cirúrgico — corrigir SOMENTE vendas de carrinho em Shipping Labels e Label Teste. Vendas sem carrinho (Flex/Coleta normais) NÃO sofrem alteração.

Princípio inegociável
- Detecção de carrinho é a chave. Só aplica a nova lógica quando o envio é carrinho.
- Definição de carrinho: `shipment_id` que tem mais de 1 `order_id` em `meli_orders_cache` OU pedido com `pack_id` cujos irmãos compartilham o mesmo `shipment_id`.
- Para envios não-carrinho, o caminho de código atual é mantido idêntico, sem qualquer mudança em rendering, distribuição de blocos, DANFE, Flex ou layout.

Diagnóstico confirmado
- Hoje os hooks já deduplicam `shipment_id` antes de chamar o backend. Isso impede gerar duas etiquetas para o mesmo envio de carrinho.
- O bug atual está no cabeçalho:
  - Em `Label Teste`, o worker carrega só o `order_id` principal do envio. Em carrinho, o cabeçalho mostra somente o primeiro item e descarta o restante, sem aviso.
  - Em `Shipping Labels`, mesmo agregando irmãos, o cabeçalho não diz que é carrinho, então o operador acha que “sumiu” item.

O que vai mudar (SOMENTE quando o envio for carrinho)

1. Função utilitária `isCartShipment(shipment)`
- Retorna verdadeiro quando o `shipment_id` aparece em mais de um `order_id`, ou quando o pedido principal tem `pack_id` com irmãos compartilhando o mesmo `shipment_id`.
- Esta função é a única porta de entrada da lógica nova. Onde ela retornar falso, todo o pipeline antigo é preservado byte-a-byte.

2. Cabeçalho de carrinho
- Aplicado apenas para envios em que `isCartShipment` é verdadeiro.
- Acrescenta uma linha clara identificando carrinho, por exemplo: `CARRINHO: N itens`.
- Agrega itens de todos os `order_id` irmãos do mesmo `shipment_id`.
- Respeita o limite de linhas configurado pelo usuário; se não couber tudo, adiciona uma linha final indicando conferência, por exemplo: `Verificar itens do carrinho (+N)`.
- Para envios não-carrinho, o cabeçalho continua sendo gerado como hoje, sem nenhuma mudança.

3. Backend `Shipping Labels` (`supabase/functions/ml-generate-labels/index.ts`)
- Manter a deduplicação por `shipment_id`.
- No bloco que monta cabeçalho, antes de construir as linhas:
  - Se o envio for carrinho, agregar irmãos e usar a regra do passo 2.
  - Se não for carrinho, usar exatamente o mesmo caminho de hoje.
- Não mexer em validações, distribuição de páginas, DANFE, Flex sem NF, layouts ou geração final.

4. Backend `Label Teste` (`supabase/functions/_shared/labeltest-render.ts` e `ml-generate-labels-labeltest-batch`)
- No worker, ao carregar pedidos do batch:
  - Buscar todos os irmãos com o mesmo `shipment_id`.
  - Carregar itens de todos esses pedidos irmãos.
- Em `renderChunkToPdf`, usar a regra do passo 2 só quando o envio for carrinho. Para envios não-carrinho, manter o caminho atual.
- Manter intacta a regra Flex já corrigida: 1 ou 2 blocos, etiqueta obrigatória, DANFE complementar.

5. Frontend
- Não mudar seleção, deduplicação, filtros, layouts ou polling.
- A única mudança visível ao usuário é o cabeçalho diferente nas etiquetas de carrinho.

6. Pequena correção lateral (não relacionada à etiqueta, mas presente como erro de runtime)
- Envolver o uso de `navigator.clipboard.writeText` em `try/catch` para evitar `Document is not focused` quebrar a UI durante a interação.

Validação por leitura de código após implementar
- Confirmar que envios não-carrinho mantêm a saída atual, sem qualquer alteração em layout, DANFE, Flex, NF ou ZPL.
- Confirmar que envios de carrinho geram exatamente 1 etiqueta com cabeçalho informando carrinho e itens agregados.
- Confirmar que Flex sem NF continua gerando só etiqueta, e Flex com NF continua gerando etiqueta + DANFE.
- Confirmar que carrinho nunca gera 2+ etiquetas para o mesmo `shipment_id`.

Memória
- Atualizar a regra `Cart Pack Grouping` para deixar explícito:
  - 1 envio = 1 etiqueta, mesmo em carrinho.
  - Cabeçalho de carrinho sempre indica que é carrinho e agrega itens, com aviso de conferência se não couber.
  - Envios não-carrinho NUNCA podem ser afetados por código novo de carrinho.

Escopo protegido
- Sem refatoração de Flex/Coleta sem carrinho.
- Sem mudança em validação de NF, distribuição de blocos ou layouts.
- Sem novo polling, novo limite ou nova seleção.
- Sem mudança em Shipping Labels além do cabeçalho do carrinho.