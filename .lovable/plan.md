Plano cirúrgico para corrigir o Label Teste sem mexer no Shipping Labels que já parece correto.

Diagnóstico confirmado
- O erro recente do Label Teste ocorreu em envios Flex com NF emitida:
  - 46987392300
  - 46986368516
- Ambos estão como `logistic_type = self_service` e `invoice_status = emitida`.
- O job do Label Teste falhou porque recebeu 2 blocos ZPL por envio, mas o segundo bloco retornou 404 no Labelary: `ZPL generated no labels`.
- A regra atual ficou errada porque tratou Flex como sempre 1 bloco no fallback, ou como esperado sempre 1 bloco na distribuição segura. Isso contradiz a regra real: Flex pode vir com 1 bloco ou 2 blocos, dependendo se a NF/DANFE veio junto.

O que vou alterar
1. Ajustar apenas o motor compartilhado do Label Teste (`supabase/functions/_shared/labeltest-render.ts`):
   - Remover a premissa “Flex = sempre 1 bloco”.
   - Para layout com DANFE (`meli_100x150` e `mlfacil_100x175_header`), aceitar Flex com 1 ou 2 blocos quando a ML retornar isso.
   - Para layout sem NF (`meli_100x150_no_nf`), manter somente 1 bloco por envio, porque esse layout é explicitamente “somente etiqueta”.

2. Corrigir a distribuição de blocos ZPL no Label Teste:
   - Se a ML retornar 1 bloco para um Flex, imprimir somente a etiqueta.
   - Se a ML retornar 2 blocos para um Flex, tentar preservar etiqueta + DANFE.
   - Se o lote misturar envios com 1 e 2 blocos, manter fallback individual por shipment para não corromper a ordem.

3. Tornar a renderização tolerante a DANFE inválida/sem imagem no Labelary:
   - A etiqueta de envio continua obrigatória.
   - Blocos extras de DANFE passam a ser opcionais: se a DANFE não renderizar no Labelary com `ZPL generated no labels`, o Label Teste não deve derrubar o envio inteiro.
   - Nesse caso, o PDF será gerado com a etiqueta e um aviso interno no log informando que a DANFE extra foi ignorada por não renderizar.
   - Isso garante o comportamento desejado: veio NF válida, imprime etiqueta + nota; não veio ou veio bloco extra inválido, imprime só a etiqueta sem erro.

4. Manter paridade com o que já funciona no Shipping Labels:
   - Não alterar `ml-generate-labels-v2`, porque ele baixa PDF direto da ML e já copia página 0 + página 1 quando existe.
   - Não alterar layout, seleção, download, cabeçalho, variação, observação ou regras de negócio.

5. Atualizar memória/regra do projeto para evitar regressão futura:
   - Registrar que Flex não é “sempre 1” nem “sempre 2”.
   - A regra correta é: imprimir o que vier disponível; etiqueta é obrigatória, DANFE é complementar/opcional.

Validação após implementar
- Conferir os logs e jobs recentes do Label Teste para garantir que o erro `ZPL generated no labels` não volte a bloquear o envio.
- Testar o fluxo do Label Teste com os envios Flex problemáticos, se ainda estiverem disponíveis na API da ML.
- Confirmar que Shipping Labels continua sem alteração.

Escopo protegido
- Sem refatoração visual.
- Sem polling novo.
- Sem limite artificial novo.
- Sem mudança em regras de seleção/download.
- Sem mexer em Shipping Labels além de leitura/validação.