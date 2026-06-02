## Causa do erro

O usuário **Wilson Longo** é colaborador (perfil Operacional) da empresa **TODOVINOBR**, que pertence ao titular `admin@todovino.com.br`. A conta ML `TODOVINOBR` (`ml_user_id 538218315`) é do titular, não do Wilson.

A UI já herda corretamente a conta ML do titular para o colaborador (via `get_accessible_ml_accounts`), mas as **edge functions de geração de etiquetas** ainda exigem que `ml_accounts.user_id = auth.uid()`:

- `supabase/functions/ml-generate-labels-v2/index.ts` (linha 143)
- `supabase/functions/ml-generate-labels-labeltest/index.ts` (linhas 163-165)

Como Wilson não é o `user_id` dono da `ml_account` da TODOVINOBR, a consulta retorna `null` e a função devolve `404 "ML account not found"`, exibido na UI como "Erro ao gerar etiqueta. Algo inesperado aconteceu...".

## Correção

Substituir a busca da `ml_account` nas duas edge functions por uma lógica que aceite tanto o titular quanto o colaborador ativo da empresa dona da conta ML.

Lógica (com `supabaseAdmin`, mantendo segurança):

1. Buscar a `ml_account` por `ml_user_id = seller_id` + `is_active = true` (sem filtrar por `user_id`).
2. Autorizar o acesso se uma das duas condições for verdadeira:
   - `ml_account.user_id = auth.uid()` (titular), **ou**
   - existe linha em `company_users` com `user_id = auth.uid()`, `status = 'active'` e `company_id = ml_account.company_id` (colaborador ativo da mesma empresa).
3. Se nada bater → manter `404 "ML account not found"`.

Manter o restante do fluxo intacto. As inserções em `meli_print_queue_v2` continuam usando `user.id` (Wilson) para registrar quem disparou o job — assim a auditoria/histórico fica correta.

## Arquivos a alterar

- `supabase/functions/ml-generate-labels-v2/index.ts` — substituir o bloco da linha 143.
- `supabase/functions/ml-generate-labels-labeltest/index.ts` — substituir o bloco das linhas 163-166.

## Validação

- Pedir ao Wilson para imprimir novamente uma etiqueta da TODOVINOBR — não deve mais aparecer o erro.
- Confirmar via `meli_print_queue_v2` que o job foi criado com `user_id = Wilson` e `seller_id = 538218315`.
- Garantir que usuários sem vínculo com a empresa continuam recebendo 404.
