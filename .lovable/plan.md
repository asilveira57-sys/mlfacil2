
Inspeção concluída

O que confirmei:
- O login `engenharia@megatools.com.br` está ligado ao usuário interno `eaced208...`, com a conta ML ativa `DETILLI ENGENHARIA` (`seller_id 38249140`).
- O erro atual não é de email nem de PDF A4. É bloqueio de validação.
- Na fila de impressão dessa conta houve falhas recentes com os envios `46851942986`, `46851566313` e `46850413240`.
- Esses envios estão no cache como:
  - `logistic_type = cross_docking`
  - `shipment_substatus = ready_for_pickup`
  - `label_available = true`
- O cache de NF mostra status `pendente`.
- No backend, a função `supabase/functions/ml-generate-labels/index.ts` ainda exige NF para todo envio que não seja Flex. Então:
  - Flex passa sem NF
  - Coleta/cross_docking é barrado com `NF não emitida para este pedido`
- A UI, porém, deixa esses pedidos selecionáveis como `reimprimir`, então o usuário consegue selecionar e só descobre o bloqueio no final. Esse desalinhamento é a causa do “não imprime nada”.

Plano urgente de correção

1. Ajustar a regra do backend por layout/formato
- Arquivo: `supabase/functions/ml-generate-labels/index.ts`
- Trocar a validação atual por regra orientada ao tipo de saída:
  - `meli_100x150` e `mlfacil_100x175_header`: manter NF obrigatória para não-Flex
  - `meli_100x150_no_nf`: permitir impressão sem NF quando `label_available = true`
  - `zpl`: minha recomendação é seguir a mesma lógica de “somente etiqueta” e liberar também sem NF
- Manter `fulfillment` bloqueado como hoje.

2. Alinhar a UI com a regra real
- Arquivos: `src/components/shipping/BulkActionsBar.tsx` e `src/hooks/useShippingLabels.ts`
- Antes de chamar a função, analisar a seleção:
  - se houver pedidos sem NF e não-Flex, desabilitar só os modos incompatíveis
  - manter disponíveis os modos permitidos (“Sem NF” e, se aprovado, ZPL)
- Trocar o erro genérico por mensagem clara:
  - “Esta seleção só pode ser impressa em Sem NF/ZPL porque há pedidos sem nota fiscal”.

3. Corrigir a reimpressão unitária
- Arquivos: `src/components/shipping/OrderDetailsDrawer.tsx` e `src/pages/ShippingLabels.tsx`
- Hoje a gaveta exige `invoice_status === 'emitida'` e, ao reimprimir PDF, sempre força `layout: 'meli_100x150'`.
- Se a regra acima for aplicada, a reimpressão individual também precisa:
  - liberar ZPL sem NF
  - usar `meli_100x150_no_nf` quando o pedido não tiver NF e o modo escolhido for somente etiqueta

4. Melhorar a coerência operacional
- Revisar o status/listagem para não tratar pedido sem NF como “reimprimir” genérico quando ele só puder sair em modo sem NF.
- Isso pode vir logo depois do hotfix, se quiser separar risco operacional.

Validação após implementação
- Testar com a própria conta `DETILLI ENGENHARIA` (`seller_id 38249140`)
- Cenários mínimos:
  1. cross_docking + NF pendente + PDF Padrão ML => deve bloquear
  2. cross_docking + NF pendente + Sem NF => deve imprimir
  3. cross_docking + NF pendente + ZPL => deve imprimir, se adotarmos essa liberação
  4. Flex sem NF => continua imprimindo
  5. Coleta com NF emitida => continua imprimindo nos modos compatíveis

Observação importante
- O problema atual não é o email do cliente.
- O problema é uma regra antiga do backend que ainda exige NF para Coleta mesmo quando o operador escolhe um modo de somente etiqueta, somada a uma UI que continua permitindo a seleção desses pedidos como se estivessem prontos para qualquer impressão.
