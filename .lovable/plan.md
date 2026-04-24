## Diagnóstico — engenharia@megatools.com.br

Esse cliente tem **dois registros distintos** no sistema, e a tag VETERANO foi aplicada no registro errado.

### Registro 1 — antigo (importação Veterano)
- `auth.users.id`: `cddaf599-9d2b-4c47-a315-e8af2ebdf4ab`
- E-mail: **detilliengenharia@gmail.com**
- Criado em: 26/03/2026
- Nunca logou (`last_sign_in_at = NULL`)
- Profile: `full_name = DETILLI ENGENHARIA`, **tag = VETERANO** ✅

### Registro 2 — atual (uso real)
- `auth.users.id`: `eaced208-d2fa-45a8-a140-342a96ca19b9`
- E-mail: **engenharia@megatools.com.br**
- Criado em: 08/04/2026
- Confirmado e logado (último login: 23/04/2026 17:34)
- Profile: `full_name = Detilli Engenharia`, **tag = NULL** ❌
- Detalhe crítico: este profile está com `user_id = NULL` (órfão do auth user real)

### Causa raiz
Quando a importação inicial de Veteranos foi feita, o e-mail cadastrado para esse cliente era `detilliengenharia@gmail.com` (Gmail). Depois, o cliente fez um **novo cadastro próprio** usando o e-mail corporativo `engenharia@megatools.com.br`. Esse novo signup criou:
1. Um auth user novo (`eaced208…`) — o que ele realmente usa hoje.
2. Um profile novo, mas com `user_id` em branco (não foi vinculado ao auth user).

A tag VETERANO ficou no profile antigo (Gmail), que nunca foi usado. Por isso, ao tentar comprar o Plano Veterano logado como `engenharia@megatools.com.br`, ele não passa na regra de elegibilidade — o sistema olha a tag do profile do usuário logado, e ele está sem tag.

Importante: ter a tag é condição **necessária mas não suficiente**. A política Veterano exige também `tenant_entitlements` válida para liberar os benefícios após o pagamento. Hoje ele tem zero pagamentos e zero entitlements registrados.

## Correção proposta

1. **Vincular o profile ativo ao auth user correto**
   - Atualizar a linha de `profiles` cujo `email = engenharia@megatools.com.br` para `user_id = eaced208-d2fa-45a8-a140-342a96ca19b9`.
   - Aplicar `tag = 'VETERANO'` nesse mesmo registro.

2. **Limpar o registro antigo (Gmail) para evitar conflito futuro**
   - Verificar se o auth user `cddaf599…` (detilliengenharia@gmail.com) tem qualquer atividade (entitlements, payments, ml_accounts, etc.).
   - Se estiver totalmente vazio (esperado, dado que nunca logou), removê-lo via fluxo padrão `admin-delete-user` para não poluir a base.
   - Se tiver algum vínculo, apenas remover a tag VETERANO desse registro e deixar registrado em `audit_logs`.

3. **Registrar a operação em `audit_logs`**
   - Ação: `veterano_tag_migration`
   - Descrição: migração da tag VETERANO do profile órfão (Gmail) para o profile ativo (corporativo), com referência aos dois user_ids.

4. **Não tocar em `tenant_entitlements`**
   - O cliente ainda precisa pagar o Plano Veterano normalmente. A tag apenas libera a visibilidade da oferta e a elegibilidade do checkout. A ativação do entitlement continua sendo feita pelo webhook do Mercado Pago após o pagamento aprovado.

## Resultado esperado

Após a correção, ao logar com `engenharia@megatools.com.br`, o cliente:
- Vê o card do Plano Veterano marcado como "Recomendado" (como na imagem que você enviou).
- Consegue clicar em "Escolher plano" e prosseguir até o checkout do Mercado Pago.
- Após pagamento aprovado, o webhook ativa o `tenant_entitlements` automaticamente (handler já corrigido recentemente para `subscription_authorized_payment`).

## Observação para o futuro

Esse caso evidencia uma fragilidade no fluxo de importação de Veteranos: quando o cliente importado se cadastra depois com um e-mail diferente do importado, a tag fica órfã. Se você quiser, posso propor em separado uma melhoria no painel admin de Veteranos para detectar e mesclar perfis duplicados por nome/CPF antes que o cliente perceba o problema.
