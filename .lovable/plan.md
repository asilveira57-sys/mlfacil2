## Diagnóstico

O caso da MK Modas não foi lançado porque o pagamento aprovado não chegou à tabela interna de pagamentos nem gerou `tenant_entitlements`.

O principal problema encontrado é na rotina automática de reconciliação: ela está agendada a cada 5 minutos, mas está chamando a função com uma credencial antiga/incorreta (`email_queue_service_role_key`). As chamadas recentes retornam `401`, então a rotina aparenta executar, mas não processa nenhum pagamento desde 04/05.

Também identifiquei um segundo ponto de fragilidade: pagamentos por assinatura recorrente podem chegar pelo Mercado Pago como `preapproval`/assinatura autorizada, e hoje o fluxo depende muito do formato do webhook recebido. Se o webhook não vier como pagamento direto, o período pode não ser ativado.

## Plano de correção

1. **Corrigir a rotina automática de reconciliação**
   - Atualizar o agendamento `billing-reconcile-payments-5min` para chamar a função com `x-cron-key` e/ou service key correta.
   - Remover a dependência da secret de e-mail para cobrança.
   - Garantir que a chamada retorne sucesso real, não apenas “cron executou”.

2. **Fortalecer a reconciliação de pagamentos recorrentes**
   - Ajustar `billing-reconcile-payments` para buscar e processar pagamentos recentes do Mercado Pago de forma independente do webhook.
   - Para pagamentos sem `external_reference`, cruzar por:
     - e-mail do pagador;
     - valor pago;
     - checkout recente do usuário;
     - assinatura/preapproval criada recentemente.
   - Registrar claramente quando um pagamento ficou sem vínculo, em vez de sumir silenciosamente.

3. **Corrigir o webhook para assinatura**
   - Melhorar `mercadopago-webhook` para tratar `preapproval` e pagamentos autorizados de assinatura de forma mais resiliente.
   - Quando vier um evento de assinatura, buscar o pagamento real e processar via `rpc_process_mp_payment`.
   - Garantir que o `external_reference` da assinatura seja preservado no processamento.

4. **Registrar o pagamento da MK Modas agora**
   - Processar manualmente o pagamento `159834233904` da MK Modas.
   - Lançar o plano `Veterano - veterano-mensal` para o tenant `6bbc333b-47b5-451c-a051-d32c3bfae0ec`.
   - Ativar o período mensal a partir do pagamento aprovado.
   - Atualizar o acesso do usuário para `payment_status = active`.

5. **Validar depois da correção**
   - Rodar a reconciliação manualmente e confirmar que ela retorna sucesso.
   - Conferir que a MK Modas aparece com assinatura ativa.
   - Conferir que a rotina agendada deixa de retornar `401` nos registros de HTTP.

## Arquivos e banco envolvidos

- `supabase/functions/billing-reconcile-payments/index.ts`
- `supabase/functions/mercadopago-webhook/index.ts`
- Migração para corrigir o agendamento da reconciliação
- Ajuste direto de dados para lançar o período da MK Modas

## Resultado esperado

Depois disso, pagamentos aprovados deixam de depender exclusivamente do webhook: se o Mercado Pago falhar no envio, atrasar ou mandar em outro formato, a reconciliação automática captura o pagamento e lança o período do cliente sem precisar acionar o suporte.