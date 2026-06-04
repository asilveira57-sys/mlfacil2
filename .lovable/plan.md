Plano de correção segura para Etiquetas de Envio

1. Padronizar a regra de filtros no banco
- Atualizar a função `get_shipping_orders` para usar uma única régua operacional baseada no prazo real do Mercado Livre:
  - prioridade: `estimated_schedule_limit` quando existir;
  - fallback: `estimated_handling_limit`;
  - comparação sempre em horário de Brasília.
- Para `Envios de hoje`, retornar apenas envios acionáveis com prazo hoje ou atrasados, excluindo cancelados e Full da contagem operacional quando o ML não exige ação do seller.
- Classificar atraso e hoje pelo prazo de despacho, não pela data da venda.

2. Corrigir status “Para imprimir” versus “Reimprimir”
- Separar corretamente:
  - `pronta`: etiqueta disponível e ainda não marcada como impressa pelo ML;
  - `reimprimir`: apenas quando o ML realmente informar `printed`, `ready_for_pickup` ou `in_packing_list` para envio ainda acionável.
- Garantir que itens `pending/buffered` sem etiqueta não inflem “Para imprimir” nem “Reimprimir”.

3. Corrigir “Hoje” para não confundir venda de hoje com envio de hoje
- Manter `Hoje` como venda criada hoje.
- Manter `Envios de hoje` como prazo de envio/coleta do ML.
- Ajustar o texto/contagem se necessário para evitar leitura errada: o número principal deve refletir o filtro ativo e os chips devem refletir somente o mesmo universo filtrado.

4. Remover armadilhas de limite e de operação em andamento
- Não adicionar `LIMIT` artificial nas regras de contagem; preservar paginação apenas para a tela.
- Manter bloqueio de sincronização enquanto existir geração de etiqueta ativa, para não mexer no cache no meio da operação.
- Remover/evitar qualquer refetch automático que altere a lista durante impressão; atualizar só via botão ou após sync concluído.

5. Validar com a conta ADECONEX
- Rodar consultas comparando:
  - `Hoje`;
  - `Envios de hoje`;
  - `Todos`;
  - `Reimprimir`;
  - prazos de hoje e atrasados.
- Conferir se o resultado passa a seguir a lógica do Mercado Livre: 17 prontas para enviar hoje + 1 atrasada, sem transformar tudo em “Reimprimir”.

Arquivos previstos
- Nova migration para substituir `public.get_shipping_orders`.
- Possível ajuste pequeno em `src/hooks/useShippingLabelsV2.ts` e/ou `src/hooks/useShippingLabels.ts` apenas se a UI estiver mandando parâmetros errados.
- Possível ajuste de label/contagem em `ShippingFilters` somente se necessário para refletir fielmente o filtro ativo.