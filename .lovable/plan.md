## Diagnóstico

O botão **Corrigir endereços** chama a função `ml-backfill-shipments`, mas ela está tentando corrigir apenas envios totalmente ausentes no cache.

Nos logs recentes, para o seller atual:
- existem milhares de envios faltando no cache;
- a função roda em loop, processa 200 por vez, mas registra **0 sincronizados e 200 erros**;
- como nada é gravado, a Curva ABC continua mostrando **N/D** e a tela diz apenas “correção iniciada”, sem confirmar resultado real.

## Plano de correção

1. **Corrigir a função de backfill de envios**
   - Evitar loop infinito quando todos os envios do lote falham.
   - Marcar envios com erro/indisponíveis como processados com status controlado, para não repetir os mesmos 200 eternamente.
   - Registrar motivo de falha suficiente nos logs, sem expor tokens ou dados sensíveis.

2. **Tornar a correção útil para a Curva ABC**
   - Garantir que envios com `shipment_id` já conhecido preencham `shipping_state_uf`, `shipping_city`, `shipping_neighborhood`, `shipping_zipcode` quando a API retornar endereço.
   - Quando o envio não retornar bairro/cidade, acionar o enriquecimento por CEP.
   - Se a API não permitir recuperar o envio, manter o pedido fora do loop infinito e deixar como “N/D” apenas quando realmente não houver dado recuperável.

3. **Melhorar o retorno para a interface**
   - Fazer o botão mostrar um resultado mais honesto: “correção iniciada” somente quando o backend aceitou o processamento.
   - Após iniciar, recarregar os dados da Curva ABC automaticamente depois de alguns segundos, em vez de depender só do usuário recarregar a página.
   - Se o backend retornar erro, exibir erro real no toast.

4. **Validar com dados reais**
   - Reconsultar a quantidade de pedidos N/D/missing para o seller atual.
   - Conferir logs da função depois da correção.
   - Testar a chamada da função e confirmar que o processamento não fica travado repetindo os mesmos envios.

## Arquivos previstos

- `supabase/functions/ml-backfill-shipments/index.ts`
- `supabase/functions/ml-enrich-neighborhoods/index.ts`, se necessário
- `src/components/abc/AbcCitiesTab.tsx`

## Resultado esperado

Ao clicar em **Corrigir endereços**, a rotina deve processar de verdade, parar de repetir falhas, preencher cidades/UF quando disponíveis e atualizar a Curva ABC automaticamente quando houver novos dados.