## Contexto

O sistema **já foi desenhado** para que cada usuário tenha sua própria conta ativa: a seleção é persistida em `user_context` filtrada por `user_id`, e o `localStorage` (`active_account_id`, `active_seller_id`) é por navegador. Em teoria, o Rafa (titular) e a Sâmila (colaboradora) — que são `auth.users` diferentes — não deveriam interferir um no outro ao trocar de conta.

O sintoma relatado (Sâmila alterna no PC dela e muda também no PC do Rafa) indica um vazamento entre sessões. Antes de mudar código, precisamos confirmar **onde** está o vazamento, porque existem 3 hipóteses plausíveis e cada uma exige uma correção diferente.

## Hipóteses a investigar

1. **`ml_accounts.is_active` sendo mutado globalmente.** Embora o `setActiveAccount` no front não escreva nesse campo, alguma edge function ou trigger pode estar marcando `is_active=true` na linha compartilhada (Sâmila e Rafa enxergam as mesmas linhas de `ml_accounts` porque pertencem ao mesmo titular). Se sim, qualquer hook que lê `is_active` passa a refletir a escolha do último que alternou.
2. **`user_context` compartilhado por engano.** A função `get_accessible_ml_accounts` ou alguma RPC pode estar lendo `active_marketplace_account_id` do **titular** (Rafa) mesmo quando o caller é o colaborador (Sâmila), fazendo a tela da Sâmila "puxar" a escolha do Rafa — e vice-versa.
3. **Cache/realtime cruzado.** Um canal `postgres_changes` em `ml_accounts` ou `user_context` sem filtro por `user_id` pode estar disparando `invalidateQueries` na sessão errada quando o outro usuário troca.

## Plano

### Passo 1 — Diagnóstico no banco (somente leitura)
- Consultar `user_context` das duas contas (Rafa e Sâmila) antes e depois de uma troca para confirmar se cada `user_id` tem sua própria linha intacta.
- Consultar `ml_accounts` (RAFA_STORE e HOME DIVERSE) e observar se `is_active` muda quando qualquer um dos dois alterna.
- Listar triggers em `ml_accounts` e `user_context` que possam propagar `is_active`/`active_marketplace_account_id` entre linhas.
- Inspecionar a função `get_accessible_ml_accounts` e qualquer RPC usada pelo `AccountSwitcher` para confirmar que ela usa `auth.uid()` do caller (e não o `user_id` do titular) ao resolver a conta ativa.

### Passo 2 — Diagnóstico no código
- Procurar em `src/` e `supabase/functions/` por escritas a `ml_accounts.is_active` que não estejam ligadas explicitamente ao fluxo de conexão/desconexão da conta.
- Procurar por subscriptions de realtime (`channel(...).on('postgres_changes', ... 'ml_accounts'|'user_context' ...)`) e validar se há filtro `user_id=eq.${auth.uid()}`.
- Confirmar que `useUserContext`, `useMlAccounts` e `ActiveAccountContext` derivam tudo a partir do `auth.getUser()` do navegador atual.

### Passo 3 — Correções (definidas após o diagnóstico)
Conforme o resultado do Passo 1/2, aplicar **uma** das correções:
- **(Hipótese 1)** Remover/condicionar a escrita em `ml_accounts.is_active` no fluxo de troca, ou migrar de vez para `is_active` deprecado — passando a depender só de `user_context.active_marketplace_account_id` (que já é por `user_id`).
- **(Hipótese 2)** Ajustar a RPC para usar `auth.uid()` ao buscar o contexto ativo, em vez de qualquer `user_id` herdado do titular. Garantir que o filtro de `inheritedForActiveCompany` no `ActiveAccountContext` resolva a empresa com base no `user_context` do colaborador, não do titular.
- **(Hipótese 3)** Adicionar filtro `user_id=eq.${auth.uid()}` nas subscriptions de realtime ou remover a invalidação global em prol de invalidação por chave.

### Passo 4 — Validação
- Simular o cenário: Rafa logado em uma sessão com RAFA_STORE ativa; Sâmila logada em outra sessão alternando entre RAFA_STORE e HOME DIVERSE. Confirmar via console/DB que o `user_context` do Rafa não muda e a tela dele continua estável.
- Confirmar o inverso (Rafa alterna, Sâmila não é afetada).

## Detalhes técnicos
- Arquivos prováveis de toque: `src/contexts/ActiveAccountContext.tsx`, `src/lib/accountUnification.ts`, função SQL `get_accessible_ml_accounts`, e edge functions que escrevem em `ml_accounts`.
- Nenhuma mudança de schema é esperada **se** a causa for Hipótese 2 ou 3. Para Hipótese 1, possível migração simples de UPDATE removendo a coluna como gatilho de "conta ativa".
- Sem impacto em RBAC: titular continua dono das contas ML; colaboradora continua herdando apenas as contas da empresa do titular.

## Pergunta antes de implementar
Posso prosseguir com o diagnóstico (Passos 1 e 2 são apenas leitura, sem alterar nada) e voltar com o resultado + a correção exata da hipótese vencedora? Ou você prefere que eu já aplique a correção mais provável (Hipótese 1 — parar de usar `ml_accounts.is_active` como "conta ativa") direto?