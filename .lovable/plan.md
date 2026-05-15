## Diagnóstico crítico

O problema não é só o cadastro do Wilson; é uma falha de modelo no app:

- O Wilson está vinculado à Todovino em `company_users`, `workspace_members` e `collaborators`.
- A preferência de workspace dele aponta para a Todovino.
- Porém a camada que carrega contas Mercado Livre (`getAllAccounts`) só busca `ml_accounts.user_id = usuário logado`.
- Como o Wilson conectou uma conta pessoal, o frontend encontra a conta `WILSONLONGO16`, marca ela como ativa e sobrescreve `user_context.active_company_id` para a empresa pessoal dele.
- A política atual de `ml_accounts` também só permite leitura por dono da conta, então o colaborador nunca “enxerga” a conexão da empresa principal.

Em resumo: o sistema está tratando “conta Mercado Livre disponível” como “conta Mercado Livre criada pelo usuário”, quando para colaborador deveria ser “conta Mercado Livre da empresa/workspace em que ele é membro”.

## Regra correta de produto

Um colaborador deve:

1. Entrar no workspace/empresa para o qual foi convidado.
2. Herdar a conexão Mercado Livre titular dessa empresa.
3. Não precisar conectar conta própria.
4. Não alternar para contas pessoais dentro do workspace da empresa.
5. Ter módulos e ações limitados pelo perfil/permissões configurados para o colaborador.
6. Nunca receber tokens Mercado Livre no navegador.

## Solução proposta

### 1. Criar uma fonte segura de contas acessíveis

Adicionar uma função de banco/RPC, por exemplo `get_accessible_ml_accounts()`, que retorna apenas metadados seguros da conta Mercado Livre:

- `id`
- `ml_user_id`
- `nickname`
- `email`
- `company_id`
- `connection_status`
- `is_active`
- `is_connected`
- datas/status de saúde da conexão

Sem `access_token` e sem `refresh_token`.

A função deve retornar:

- contas próprias do usuário, quando ele é dono;
- contas de empresas onde ele é membro ativo em `company_users`;
- somente contas ativas/conectadas ou em atenção, conforme o uso da UI.

Manter a RLS direta de `ml_accounts` restrita ao dono para não expor tokens por consulta direta.

### 2. Refatorar a camada de contas do frontend

Alterar `src/lib/accountUnification.ts` para que:

- `getAllAccounts()` use a nova RPC segura em vez de `ml_accounts.select('*').eq('user_id', user.id)`.
- `getAccountBySellerId()` e `validateSellerAccess()` também considerem contas herdadas da empresa.
- A interface `UnifiedMarketplaceAccount` deixe de carregar tokens no frontend.

### 3. Corrigir seleção da conta ativa

Alterar `src/contexts/ActiveAccountContext.tsx` para:

- Resolver primeiro a empresa/workspace ativa do usuário.
- Para colaborador, priorizar a conta Mercado Livre da empresa ativa.
- Ignorar `localStorage.active_account_id` quando ele apontar para conta fora da empresa/workspace ativo.
- Ao persistir contexto, gravar `active_company_id` da conta herdada correta.
- Se o usuário for colaborador, não permitir trocar para conta pessoal pelo seletor enquanto estiver no workspace da empresa.

### 4. Ajustar o seletor de contas

Alterar `src/components/layout/AccountSwitcher.tsx` para:

- Mostrar a conta da Todovino como conta ativa para Wilson.
- Não exibir “Conectar Conta” para colaborador sem conta própria.
- Opcionalmente indicar visualmente “Conta da empresa” para contas herdadas.
- Evitar que colaborador gerencie/conecte contas Mercado Livre se o perfil não permitir integrações.

### 5. Corrigir refresh de token para conta herdada

Alterar `supabase/functions/ml-token-refresh/index.ts` para autorizar refresh quando:

- o usuário é dono da conta; ou
- o usuário é membro ativo da empresa (`company_users`) vinculada à conta.

A função deve retornar apenas status de sucesso/erro para o frontend, não o `accessToken`.

### 6. Corrigir fluxo de criação/aceite de colaborador

Ajustar `supabase/functions/collaborator-invite/index.ts` e/ou o fluxo pós-login para que, ao ativar colaborador:

- `user_preferences.active_workspace_id` aponte para o workspace da empresa convidante;
- `user_context.active_company_id` aponte para a empresa convidante;
- `user_context.active_marketplace_account_id` aponte para a conta Mercado Livre titular da empresa;
- o colaborador não seja tratado como owner da empresa pessoal recém-criada quando existir convite ativo.

### 7. Reparar o caso Wilson/Todovino

Após a correção estrutural, aplicar um ajuste de dados para o Wilson:

- `user_context.active_company_id = Todovino`
- `user_context.active_marketplace_account_id = TODOVINOBR`
- manter vínculo em `company_users`, `workspace_members` e `collaborators`
- opcionalmente desativar/ignorar a conta pessoal `WILSONLONGO16` no contexto da Todovino, sem apagá-la

### 8. Validar permissões por perfil

Conferir `useCollaboratorAccess` para que ele busque o `company_users` da empresa ativa, não qualquer registro do usuário. Hoje o Wilson tem duas empresas; uma consulta `.maybeSingle()` sem escopo pode pegar a empresa errada e liberar/bloquear módulos incorretamente.

## Arquivos principais a alterar

- `src/lib/accountUnification.ts`
- `src/contexts/ActiveAccountContext.tsx`
- `src/components/layout/AccountSwitcher.tsx`
- `src/hooks/useCollaboratorAccess.ts`
- `src/lib/mlTokenRefresh.ts`
- `supabase/functions/ml-token-refresh/index.ts`
- possivelmente `supabase/functions/collaborator-invite/index.ts`
- migração para RPC segura de contas acessíveis
- ajuste pontual de dados do Wilson

## Resultado esperado

Depois da implementação, ao Wilson logar:

- o topo deve mostrar `TODOVINOBR`, não `WILSONLONGO16`;
- o dashboard deve considerar a conexão da Todovino como conectada;
- Wilson não deve ser solicitado a conectar Mercado Livre;
- os módulos continuam limitados pelo perfil Operacional;
- chamadas backend que dependem do seller da Todovino deixam de falhar por `user_id` diferente do dono da conexão.