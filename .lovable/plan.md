
Do I know what the issue is? Sim.

O que está quebrado de verdade

1. Conversor ZPL
- O erro não é do serviço externo em si. O app está enviando para renderização um pedaço de ZPL que não gera etiqueta.
- O ponto mais suspeito é `src/hooks/useZPLSettings.ts`, principalmente `splitShopeeLabels`.
- Hoje a tela conta “3 etiquetas detectadas”, mas essa contagem usa uma heurística permissiva. Em alguns arquivos Shopee, o bloco separado por `~DGR` pode conter só definição gráfica/preambulo e não um `^XA ... ^XZ` imprimível.
- Resultado: a UI mostra que encontrou etiquetas, mas a primeira fatia enviada retorna `Requested 1st label but ZPL generated no labels`.
- Isso também explica por que parece que “do nada tudo que é ZPL parou”: o parser e o contador estão inconsistentes.

2. Etiqueta com cabeçalho
- O bloqueio não está “aleatório”; ele está codificado em `src/lib/shippingLabelRules.ts`.
- Hoje o sistema trata:
  - `mlfacil_100x175_header` = cabeçalho + DANFE
  - `meli_100x150_no_nf` = cabeçalho sem DANFE
- Só que a interface mostra isso de forma confusa:
  - `Com Cabeçalho` fica desabilitado quando falta NF
  - o outro modo aparece como `Somente Etiquetas de envio`, com um subtítulo pequeno “com cabeçalho”
- Para o usuário, parece que “o cabeçalho foi desativado”, quando na prática o produto ficou mal nomeado e inconsistente entre barra em lote, reimpressão e backend.

Arquivos que precisam entrar no conserto
- `src/hooks/useZPLSettings.ts`
- `src/pages/ZPLConverter.tsx`
- `src/lib/shippingLabelRules.ts`
- `src/components/shipping/BulkActionsBar.tsx`
- `src/components/shipping/OrderDetailsDrawer.tsx`
- `src/pages/ShippingLabels.tsx`
- `supabase/functions/ml-generate-labels/index.ts`
- se necessário, revisar a classificação em `get_shipping_orders` nas migrations mais recentes

Plano de correção definitiva

1. Consertar o parser ZPL primeiro
- Substituir a heurística atual por um parser único que só devolva etiquetas realmente imprimíveis.
- Regra: cada item convertido precisa terminar como bloco válido com `^XA ... ^XZ`; se o arquivo tiver preâmbulo gráfico, ele deve ser anexado ao bloco certo, não virar “etiqueta” sozinho.
- Usar a mesma função para:
  - contar etiquetas
  - mostrar “Etiquetas detectadas”
  - gerar preview
  - converter para PDF
- Adicionar fallback seguro: se o split produzir blocos inválidos, tentar o documento inteiro antes de acusar erro.

2. Blindar o conversor contra falso positivo
- Em `src/pages/ZPLConverter.tsx`, antes de processar em lote, validar o primeiro bloco retornado.
- Se não houver bloco imprimível, mostrar erro claro de parsing, não erro genérico de conversão.
- Isso evita a situação atual em que a tela promete 3 etiquetas mas falha na primeira requisição.

3. Corrigir a UX da etiqueta com cabeçalho
- Renomear as opções PDF para algo impossível de interpretar errado:
  - `Padrão ML`
  - `Cabeçalho sem DANFE`
  - `Cabeçalho + DANFE`
- Parar de esconder a informação importante em subtítulo pequeno.
- Aplicar esse mesmo texto na barra em lote e na reimpressão individual.

4. Unificar a regra de disponibilidade
- Manter a lógica real já refletida no backend:
  - Flex: tudo liberado
  - Coleta/cross-docking sem NF: `Padrão ML` e `Cabeçalho sem DANFE` liberados; `Cabeçalho + DANFE` bloqueado
  - Full: bloqueado
- Fazer a UI inteira consumir essa mesma regra, sem atalhos locais.

5. Alinhar reimpressão individual
- Hoje a gaveta usa auto-roteamento e isso aumenta a confusão.
- Ajustar para exibir explicitamente qual PDF será gerado e por quê.
- Se não houver NF, oferecer o botão correto de cabeçalho sem DANFE em vez de parecer que “cabeçalho sumiu”.

6. Revisar backend só no ponto necessário
- Em `supabase/functions/ml-generate-labels/index.ts`, confirmar e preservar:
  - `mlfacil_100x175_header` exige NF
  - `meli_100x150_no_nf` continua passando pela pipeline com cabeçalho e `skipDanfe`
- Melhorar a mensagem de retorno para diferenciar:
  - “NF ausente para DANFE”
  - “cabeçalho sem DANFE disponível”
  - “envio Full não imprime pelo seller”

Validação obrigatória após implementar
- ZPL Shopee com múltiplas etiquetas: não pode mais detectar 3 e falhar na primeira
- ZPL Full Produto e Full Volume: conversão precisa continuar funcionando
- Coleta sem NF:
  - `Padrão ML` funcionando
  - `Cabeçalho sem DANFE` funcionando
  - `Cabeçalho + DANFE` bloqueado com motivo claro
- Coleta com NF:
  - `Cabeçalho + DANFE` funcionando
- Reimpressão individual e em lote com os mesmos nomes e a mesma regra

Abordagem
- Vou fazer um hotfix cirúrgico nessas duas frentes sem mexer em partes não relacionadas.
- A prioridade é restaurar operação primeiro e só depois revisar classificação de abas se ainda houver ruído.