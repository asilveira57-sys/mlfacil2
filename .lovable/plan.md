

# Corrigir Rota de Primeiro Acesso para Clientes Novos e Importados

## Problema identificado

A função `get_or_create_user_access_state` possui um "auto-heal" que marca o onboarding como `completed` sempre que detecta uma **company ativa** ou **ML account ativa**. Isso causa dois problemas:

1. **Cliente importado** (criado pelo admin com empresa pré-cadastrada) — ao fazer o primeiro login, a company ativa já existe. O auto-heal marca onboarding como `completed` antes do usuário ver a tela de primeiro acesso. Resultado: vai direto pro Dashboard.

2. **Cliente novo** — se por algum motivo a company é criada antes do onboarding completar (ex: race condition, callback OAuth), o mesmo auto-heal pula o primeiro acesso.

3. **Clientes que já completaram** (com login anterior + conta ML conectada) — devem continuar pulando normalmente.

## Causa raiz (uma única linha)

Na migration mais recente (`20260415011741`), linhas 43-48 e 72-77:

```sql
-- Auto-heal: se tem company ativa OU ML account, marca como completed
EXISTS(SELECT 1 FROM public.companies WHERE user_id = p_user_id AND is_active = true)
```

Ter uma company ativa **não significa** que o usuário passou pelo onboarding. Pode ter sido criada pelo admin na importação.

## Correção proposta

### 1. Ajustar `get_or_create_user_access_state` (migration SQL)

Remover `companies` como sinal de auto-heal. Manter apenas sinais confiáveis de que o usuário realmente usou o sistema:

- `onboarding_user_progress` com status `completed` (fluxo de welcome cards)
- `ml_accounts` com `is_active = true` (só existe se o usuário fez OAuth pessoalmente)
- `onboarding_completed_at IS NOT NULL` no próprio `user_access_state` (só é setado quando o `update_onboarding_state` roda com `status = 'completed'`)

A regra fica:
- **Auto-heal SIM**: se tem `ml_accounts` ativa OU `onboarding_user_progress` completado OU `onboarding_completed_at` já foi setado antes
- **Auto-heal NÃO**: ter `companies` ativa sozinha NÃO é suficiente

### 2. Não mexer no frontend

O `ProtectedRoute` e o `PrimeiroAcesso.tsx` estão corretos:
- `ProtectedRoute` redireciona para `/primeiro-acesso` quando `requiresOnboarding = true`
- `PrimeiroAcesso` redireciona para `/dashboard` quando `requiresOnboarding = false`
- `Auth.tsx` redireciona para `/primeiro-acesso` após login

A lógica inteira depende do valor de `requires_onboarding` que vem do banco. Corrigindo o banco, o frontend funciona.

### 3. Não quebrar clientes existentes

A migration NÃO vai alterar nenhum `onboarding_status` existente que já esteja como `completed`. Só muda o critério do auto-heal para novas consultas. Clientes que já passaram pelo onboarding e têm status `completed` continuam inalterados.

**Checklist de segurança:**
- Clientes com `onboarding_status = 'completed'` → sem alteração, continuam no dashboard
- Clientes com ML account ativa → auto-heal continua funcionando (ML account = prova de uso real)
- Clientes importados sem login anterior → auto-heal NÃO dispara (company sozinha não basta)
- Clientes novos → auto-heal NÃO dispara (não tem nada ainda)

### Arquivo alterado

- Nova migration SQL: reescreve `get_or_create_user_access_state` removendo `companies` do critério de auto-heal

### O que NÃO muda

- `ProtectedRoute.tsx` — intacto
- `PrimeiroAcesso.tsx` — intacto
- `Auth.tsx` — intacto
- `useUserAccessState.ts` — intacto
- `UserAccessContext.tsx` — intacto
- `get_user_feature_flags` — intacto
- `get_user_status` — intacto
- `update_onboarding_state` — intacto
- Nenhum dado existente é alterado

