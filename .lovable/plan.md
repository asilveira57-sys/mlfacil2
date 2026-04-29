Plano de ação urgente para pagamentos

Identifiquei sinais fortes de que o problema não é um caso isolado de cliente, e sim uma falha estrutural no reconhecimento automático:

1. Há checkouts recentes criados para clientes que aparecem nos seus comprovantes, mas não há registros correspondentes em `tenant_payments` nem lançamentos automáticos em `tenant_entitlements`.
2. Não aparecem chamadas recentes do webhook de pagamento no backend, enquanto outros webhooks do sistema estão chegando normalmente.
3. O fluxo atual depende quase 100% do webhook. Quando o Mercado Pago não chama, chama com formato diferente, ou o processamento falha silenciosamente, o sistema não tem uma reconciliação automática de segurança.
4. O sistema tem uma função periódica de billing explicitamente bloqueada/desativada, então hoje não existe um “segundo motor” para buscar pagamentos aprovados e corrigir lançamentos pendentes.
5. Já há histórico anterior de recuperação manual por falha de webhook, o que confirma o padrão.

Casos já encontrados nos dados

- 373 AUTOPARTS: há checkout em 28/04 para plano recorrente `51-300 / rec_1m`; o valor líquido do comprovante é compatível com pagamento bruto de R$ 44,90.
- POLICARPO PEÇAS: há checkout em 28/04 para `ZPL Básico / rec_1m`; o valor líquido de R$ 17,01 é compatível com pagamento bruto de R$ 17,90.
- Megatools / Detilli Engenharia: há múltiplos checkouts de Veterano semestral recentes.
- LaserUP já foi provisionado manualmente, mas o lançamento ficou com `entitlement_type = plan`, enquanto o motor automático trabalha com `tier`; isso precisa ser normalizado para evitar inconsistência futura.
- O comprovante “Bruno Fernando Leme” ainda precisa ser reconciliado via API do Mercado Pago porque não encontrei perfil direto com esse nome no cadastro. O vínculo provavelmente virá pelo payer/email/payment_id retornado pela API.

O que vou implementar após sua aprovação

1. Corrigir o webhook de pagamento para aceitar todos os formatos do Mercado Pago

Hoje o backend espera formatos específicos como:

```text
type = payment
type = subscription_preapproval
type = subscription_authorized_payment
```

Vou tornar o webhook tolerante aos formatos reais do Mercado Pago, incluindo:

```text
action = payment.created / payment.updated
topic = payment / preapproval / authorized_payment
data.id
id em query string
resource/url de evento
```

Também vou parar de “engolir” erros de processamento sem rastreabilidade: o webhook continuará respondendo OK quando necessário para não quebrar retries do Mercado Pago, mas vai gravar logs internos claros do motivo da falha.

2. Criar um processamento idempotente e transacional de pagamentos

Vou centralizar a regra em uma função segura do banco, para garantir que:

- o mesmo pagamento nunca lance período duas vezes;
- pagamento avulso lance exatamente o período comprado;
- assinatura lance/renove automaticamente a partir do pagamento aprovado;
- renovação some período a partir do maior valor entre “agora” e “fim atual”, evitando perda de dias;
- estorno/cancelamento marque o pagamento corretamente e não gere novo período;
- pagamento rejeitado/pending fique registrado, mas não ative acesso.

Fluxo proposto:

```text
Pagamento aprovado recebido
  -> grava/atualiza tenant_payments com chave única provider + payment_id
  -> resolve external_reference / checkout / oferta
  -> identifica tenant + cliente + plano/oferta
  -> ativa ou renova tenant_entitlements
  -> atualiza estado de acesso do usuário
  -> registra log humano no admin
```

3. Adicionar uma reconciliação automática de segurança

Além do webhook, vou criar um reconciliador administrativo para buscar pagamentos aprovados direto no Mercado Pago e processar o que não entrou pelo webhook.

Ele vai:

- buscar pagamentos recentes por período;
- buscar assinaturas/preapprovals e authorized payments;
- cruzar com checkouts criados no sistema;
- cruzar por `external_reference`, valor, data, payer/email e provider_id;
- processar automaticamente os casos de alta confiança;
- listar casos ambíguos para revisão, sem travar os casos claros.

Isso resolve o problema principal: mesmo se o webhook falhar de novo, o sistema terá uma recuperação automática.

4. Rodar backfill dos pagamentos recentes

Depois da correção, vou executar a reconciliação desde 27/04 até agora para capturar os três pagamentos informados.

Objetivo do backfill:

- localizar o pagamento bruto correspondente aos comprovantes;
- registrar em `tenant_payments`;
- lançar o período correto no cliente correto;
- deixar auditável no painel admin.

Casos esperados:

```text
373 AUTOPARTS      -> provável 51-300 mensal, R$ 44,90 bruto
POLICARPO PEÇAS    -> provável ZPL Básico mensal, R$ 17,90 bruto
Bruno Fernando Leme -> identificar via API Mercado Pago/payer e vincular ao checkout correto
Megatools           -> validar se houve pagamento efetivo do Veterano semestral antes de provisionar
```

Não vou lançar período “no chute” apenas pelo valor líquido do print. Vou usar a API do Mercado Pago para confirmar pagamento aprovado, payer e referência.

5. Ajustar o painel `/admin/pagamentos`

Como você está usando essa tela para suporte, vou reforçar o painel com:

- botão “Sincronizar Mercado Pago agora”;
- lista de pagamentos aprovados sem entitlement vinculado;
- status claro: Pago e lançado / Pago pendente de vínculo / Rejeitado / Estornado;
- identificação humana do cliente: nome e e-mail, não UUID;
- último erro de webhook/reconciliação quando existir.

6. Normalizar inconsistências existentes

Vou corrigir registros manuais recentes que ficaram fora do padrão do motor automático, especialmente:

- LaserUP com `entitlement_type = plan` para compatibilidade com o padrão `tier`, se necessário após validar os checks de acesso;
- pagamentos manuais sem `external_reference` padronizado;
- entitlements ativos sem `offer_id` quando a oferta puder ser resolvida com segurança.

Validações finais

Ao final, vou verificar:

- webhook aceita payload real e payload legado;
- pagamento avulso ativa período correto;
- assinatura recorrente renova sem duplicar;
- reenvio do mesmo webhook não duplica período;
- pagamento rejeitado/estornado não ativa acesso;
- admin consegue sincronizar e ver pendências;
- os clientes recentes aparecem com período lançado corretamente.

Arquivos/áreas que serão alteradas

- `supabase/functions/mercadopago-webhook/index.ts`
- nova função backend de reconciliação, provavelmente `billing-reconcile-payments`
- função/RPC segura no banco para processar pagamento de forma idempotente
- painel admin de pagamentos (`/admin/pagamentos`)
- possivelmente pequenos ajustes nos tipos/hooks de billing para exibir o status corretamente

Resultado esperado

Depois da implementação, cada pagamento aprovado do Mercado Pago deve cair automaticamente no sistema, lançar o período correto e ficar visível no admin. Se o webhook falhar, a reconciliação recupera sem gerar demanda manual recorrente.