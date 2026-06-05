Plano para deixar a tela de etiquetas fiel ao Mercado Livre

Objetivo

- Fazer o card/lista do MKTP Fácil seguir a mesma lógica operacional do Mercado Livre:
  - NF-e para gerenciar
  - Etiquetas para imprimir
  - Prontas para enviar
  - Total = soma dessas três categorias
- Separar corretamente:
  - Hoje = vendas criadas hoje.
  - Envios de hoje = envios que precisam ser despachados hoje/atrasados, igual ao card “Para enviar” do Mercado Livre.
- Evitar mexer no meio da operação com atualização automática pesada: nada de sync automático inesperado; atualização só pelo botão Atualizar ou rotina controlada de etiquetas.

Diagnóstico encontrado

- A função atual `get_shipping_orders` ainda mistura duas coisas diferentes:
  - período da venda (`created_at_meli`)
  - prazo/status operacional do envio (`estimated_schedule_limit`, `estimated_handling_limit`, `shipment_status`, `shipment_substatus`)
- O status atual `pronta` está sendo usado como “Para imprimir”, mas também inclui casos já impressos.
- O filtro “Reimprimir” está aparecendo como um status concorrente, quando no Mercado Livre isso corresponde melhor a “Prontas para enviar” ou a uma ação visual de reimpressão, não a uma quarta categoria que bagunça o total.
- Existem envios antigos/stale no cache, principalmente `pending/buffered` e registros que provavelmente já mudaram para enviado no Mercado Livre, entrando em filtros de 7 dias e inflando contadores.
- Na TODOVINOBR, a consulta direta do banco agora mostra divergência real entre o que está no cache e o que o Mercado Livre exibe, então a correção precisa envolver regra de status e reconciliação leve dos envios ativos.

Regra nova proposta

1. Períodos

- Todos:
  - lista operacional recente de etiquetas, sem trazer enviados/cancelados/entregues como se fossem ação pendente.
- Hoje:
  - filtra por venda criada hoje em Brasília, usando `created_at_meli`.
  - não usa prazo de despacho.
- Envios de hoje:
  - filtra por envio ativo com prazo de despacho hoje ou atrasado.
  - precisa bater com o card do Mercado Livre “Para enviar”.
  - total = `NF-e para gerenciar + Etiquetas para imprimir + Prontas para enviar`.
- 7, 15 e 30 dias:
  - filtram vendas/envios dentro do período, mas mantendo apenas o universo operacional da tela de etiquetas.
  - enviados, entregues, cancelados, dropped_off, in_hub e Full não devem inflar a lista principal de etiquetas pendentes.

2. Status operacionais

Substituir a régua atual por três buckets explícitos:

```text
aguardando_nf
  = NF-e para gerenciar
  = envio ativo que exige nota e ainda está com substatus fiscal pendente

para_imprimir
  = Etiquetas para imprimir
  = envio ativo com etiqueta liberada, mas ainda não impresso/coletado

pronta_enviar
  = Prontas para enviar
  = envio ativo já impresso ou pronto para postagem/coleta
```

Manter `is_reprint` apenas como booleano visual/ação, não como status principal que altera o total.

3. Exclusões obrigatórias

A tela de etiquetas não deve contar como pendente operacional:

- `shipment_status`: `shipped`, `delivered`, `not_delivered`, `cancelled`
- `shipment_substatus`: `dropped_off`, `in_hub`, `buffered` quando ainda não é uma ação do seller
- `logistic_type`: `fulfillment` no fluxo principal de etiquetas do seller
- pedidos cancelados
- registros sem shipment válido, exceto quando forem exibidos claramente como pendência de sincronização fora do total operacional

Implementação planejada

1. Ajustar a RPC `get_shipping_orders`

- Reescrever a classificação para retornar status claros:
  - `aguardando_nf`
  - `para_imprimir`
  - `pronta_enviar`
  - estados técnicos separados: `pendente_sync`, `full`, `enviado`, `outros`
- Alterar os contadores para:
  - `all`
  - `aguardando_nf`
  - `para_imprimir`
  - `pronta_enviar`
- Fazer `all` representar apenas o total operacional no contexto da tela, principalmente em “Envios de hoje”.
- Garantir que `Envios de hoje` use prazo de corte/despacho em Brasília e inclua atrasados ainda acionáveis.
- Garantir que `Hoje` use data de venda, não prazo de despacho.

2. Ajustar frontend da tela de etiquetas

- Trocar chips/status para refletir a mesma linguagem do Mercado Livre:
  - Todos
  - Para imprimir
  - Aguardando NF
  - Prontas para enviar
- Remover “Reimprimir” como filtro principal ou transformá-lo em ação/indicador visual dentro de “Prontas para enviar”.
- Atualizar tipos TypeScript, contadores e traduções PT/EN/ES.
- Manter seleção/impressão habilitada apenas nos status realmente imprimíveis.

3. Corrigir sincronização sem estressar a operação

- Não adicionar sync automático pesado ao abrir a tela.
- No botão Atualizar, fazer uma reconciliação pontual e limitada ao seller atual:
  - pedidos recentes necessários
  - envios ativos/pendentes de etiqueta
  - notas fiscais desses pedidos
- Revalidar também envios antigos que ainda aparecem como ativos no cache, para remover da tela os que o Mercado Livre já marcou como enviados/postados.
- Após Atualizar, invalidar/refazer a consulta da tela automaticamente; o vendedor não deve precisar dar F5.

4. Critérios de aceite

Para TODOVINOBR, depois da correção e de uma atualização pontual:

- O filtro Envios de hoje deve bater com o card do Mercado Livre:
  - NF-e para gerenciar = 12
  - Etiquetas para imprimir = 2
  - Prontas para enviar = 1
  - Todos = 15
- O filtro Hoje deve listar vendas feitas hoje, mesmo que não sejam o mesmo conjunto de “envios de hoje”.
- O filtro 7 dias não deve trazer venda/envio já enviado como pendência de etiqueta.
- Nenhum enviado, entregue, cancelado, Full ou buffered sem ação deve inflar o total operacional.
- Clicar Atualizar deve corrigir a tela sem F5.

5. Validação antes de concluir

- Consultar a RPC diretamente para TODOVINOBR antes/depois.
- Conferir contadores por status no banco.
- Testar visualmente a tela `/shipping-labels` com os filtros:
  - Hoje
  - Envios de hoje
  - 7 dias
  - Aguardando NF
  - Para imprimir
  - Prontas para enviar
- Confirmar que a mudança não reativa sincronizações automáticas amplas nem aumenta custo de balance.