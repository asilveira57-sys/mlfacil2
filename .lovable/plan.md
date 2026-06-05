## Diagnóstico

O backend está saudável; o problema está na regra de filtragem da tela de etiquetas.

Para o seller `472990216`, a RPC atual retorna exatamente **13** em `Envios de hoje`, todos como `pronta_enviar`.

Os exemplos enviados existem no cache, mas estão fora do filtro atual:

- `2000013248859093` → no banco é `pack_id`; pedido real `2000016684286938`; venda de `30/05`; shipment `47182817130`.
- `2000013314214667` → no banco é `pack_id`; pedido real `2000016746942782`; venda de `02/06`; shipment `47210432443`.
- `2000013322344495` → pack com 2 pedidos reais (`2000016754593296`, `2000016754597060`); shipment `47213816577`.
- `2000013323256149` → pedido real `2000016755385572`; shipment `47214207345`.

Todos estão com:

- `shipment_status = ready_to_ship`
- `shipment_substatus = printed`
- `logistic_type = xd_drop_off`
- `label_available = true`
- `final_status = pronta_enviar`
- `estimated_handling_limit` e `estimated_schedule_limit` nulos

O bug principal é este trecho da RPC: quando o envio está **sem cutoff**, ela só inclui em `Envios de hoje` se a venda foi criada **ontem ou hoje**. O Mercado Livre, porém, mostra esses envios dentro do card de hoje porque estão prontos e precisam ser postados na agência hoje, mesmo sendo vendas antigas.

Também há um segundo risco: pedidos enviados como `pack_id` são pesquisáveis no banco, mas a tela pode mostrar/filtrar pelo `order_id` interno do pedido, o que confunde quando o Mercado Livre exibe o número do pack.

## Plano de correção

### 1. Corrigir a RPC `get_shipping_orders`

Ajustar a regra de `today_dispatch` para envios sem cutoff:

- manter a exclusão de Full, enviados, entregues, cancelados, `in_hub` e `dropped_off`;
- incluir `ready_to_ship/printed` e `label_available = true` mesmo quando `estimated_*_limit` está nulo;
- remover a trava artificial `created_at_meli >= ontem` para esses casos;
- continuar usando `created_at_meli` apenas no filtro **Hoje / vendas de hoje**, não em **Envios de hoje**.

Resultado esperado: pedidos prontos para enviar, sem cutoff, deixam de sumir do card operacional.

### 2. Tratar pack como unidade operacional

Na listagem e na deduplicação:

- manter a deduplicação por `shipment_id`, que é a unidade correta para etiqueta;
- garantir que `pack_id` seja considerado na busca e retorno visual;
- quando existir `pack_id`, preferir exibir o identificador do pack como referência principal, pois é o número que o Mercado Livre costuma mostrar ao vendedor.

Isso evita a sensação de “pedido não existe” quando o usuário procura pelo número visto no Mercado Livre.

### 3. Separar definitivamente os dois conceitos

Reforçar a regra:

- **Hoje** = vendas criadas hoje em Brasília (`created_at_meli`).
- **Envios de hoje** = envios acionáveis que precisam ir para despacho hoje, incluindo prontos sem cutoff.

A UI já tem os dois filtros; o ajuste será garantir que a RPC não volte a misturar as regras.

### 4. Validação com os pedidos citados

Depois da migration:

- consultar novamente `get_shipping_orders('472990216', ..., 'today_dispatch')`;
- confirmar que os shipments dos exemplos aparecem quando são acionáveis;
- confirmar contador esperado contra o print do Mercado Livre;
- confirmar que enviados/entregues/cancelados/Full continuam fora do total operacional.

### 5. Proteção contra custo e estresse operacional

A correção será feita na lógica de consulta e exibição, sem criar sincronização automática pesada.

Não vou adicionar rotina que atualiza todos os vendedores, nem importação ampla. O botão **Atualizar** continua sendo o ponto controlado para reconciliação pontual.