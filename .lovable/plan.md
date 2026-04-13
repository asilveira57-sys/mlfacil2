

## Diagnóstico

O pagamento R$17.90 (transação 154604698714) do usuário **NOVAVIDA C.** (overlordcomerciobrasil@gmail.com) foi feito via **assinatura recorrente** (preapproval) do plano ZPL Básico Mensal.

### Causa raiz: `notification_url` ausente para assinaturas recorrentes

No `billing-checkout/index.ts`, a `notification_url` do webhook só é configurada para pagamentos **one-time** (linha 204):

```text
ONE-TIME (preferência):  notification_url: ".../mercadopago-webhook"  ✅
RECURRING (preapproval): notification_url: NÃO DEFINIDA              ❌
```

Sem `notification_url`, o Mercado Pago nunca notifica o sistema sobre o pagamento aprovado. Confirmado pelos logs: **zero chamadas** ao `mercadopago-webhook` para este pagamento.

Resultado: pagamento aprovado no MP, mas `tenant_payments` vazio e `tenant_entitlements` vazio para este tenant. O `user_access_state` ainda mostra `payment_status: trial` com trial expirado em 12/abr.

---

## Plano de Correção

### 1. Ativar manualmente o plano do usuário Nova Vida (imediato)

Usar o insert tool para:
- Inserir registro em `tenant_payments` com os dados do pagamento aprovado
- Chamar `rpc_activate_entitlement` para o tenant `bebfe712-a911-42e5-b44a-818ca99c75c7` com tier `zpl-basico`, offer `rec_1m`
- Atualizar `user_access_state.payment_status` para `active`

### 2. Corrigir billing-checkout — adicionar `notification_url` nas assinaturas

**Arquivo:** `supabase/functions/billing-checkout/index.ts`

Adicionar `notification_url: \`\${supabaseUrl}/functions/v1/mercadopago-webhook\`` nos dois caminhos de criação de preapproval:
- Linha ~134 (preapproval com `mp_product_ref`)
- Linha ~163 (preapproval ad-hoc)

### 3. Verificar se a oferta rec_1m requer `mp_product_ref`

A oferta `rec_1m` tem `mp_product_ref: null`, então usa o caminho ad-hoc. O fix no passo 2 cobre ambos os caminhos.

---

## Resumo de alterações

| Ação | Tipo |
|---|---|
| Ativar plano Nova Vida manualmente | Insert/RPC no banco |
| Adicionar `notification_url` em preapprovals | Edição em `billing-checkout/index.ts` |

Isso corrige o problema para este usuário e previne que todos os futuros pagamentos por assinatura recorrente fiquem sem processamento.

