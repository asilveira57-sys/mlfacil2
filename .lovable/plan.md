

## Diagnóstico: Reset em massa acidental do onboarding

### Causa raiz confirmada

Em **13/04/2026 às 21:01 UTC**, a função `admin_bulk_reset_onboarding` foi executada e resetou o `onboarding_status` para `'pending'` em **83 contas** com tag VETERANO que não tinham ML conectado naquele momento.

Essas contas **já haviam completado o onboarding** via `/primeiro-acesso`, mas o mecanismo de auto-reparo (`get_or_create_user_access_state`) não consegue reverter porque:
- A auto-cura depende da tabela `onboarding_user_progress`
- O fluxo `/primeiro-acesso` grava o status direto em `user_access_state` e **não cria registro** em `onboarding_user_progress`
- Sem esse registro, o sistema não tem como saber que o onboarding já foi feito

Resultado: ao logar, `get_user_status` retorna `requires_onboarding: true`, e o `ProtectedRoute` redireciona para `/primeiro-acesso`.

### Plano de correção (3 partes)

**1. Correção imediata dos dados (migration SQL)**

Reverter os 83 usuários afetados pelo bulk reset de 13/04:

```sql
UPDATE user_access_state
SET onboarding_status = 'completed', updated_at = now()
WHERE onboarding_status = 'pending'
  AND updated_at BETWEEN '2026-04-13 21:01:00+00' AND '2026-04-13 21:02:00+00';
```

Além disso, corrigir TODOS os usuários com `onboarding_status = 'pending'` que já possuem sinais claros de uso (ML conectado, ou com companies ativas):

```sql
UPDATE user_access_state uas
SET onboarding_status = 'completed', updated_at = now()
WHERE uas.onboarding_status = 'pending'
  AND (
    uas.ml_account_connected = true
    OR EXISTS (SELECT 1 FROM companies c WHERE c.user_id = uas.user_id AND c.is_active = true)
  );
```

**2. Melhorar o auto-reparo em `get_or_create_user_access_state`**

Adicionar verificação adicional: se `onboarding_status = 'pending'` mas o usuário já tem ML conectado ou company ativa, marcar como `'completed'` automaticamente.

```sql
IF v_state.onboarding_status = 'pending' THEN
  -- Check onboarding_user_progress (existing)
  -- PLUS: check if user has active ML account or company (new)
  IF v_onboarding_done OR v_ml_account.id IS NOT NULL OR v_company IS NOT NULL THEN
    UPDATE user_access_state SET onboarding_status = 'completed' ...
  END IF;
END IF;
```

**3. Proteger o `admin_bulk_reset_onboarding` contra uso acidental**

Remover a função `admin_bulk_reset_onboarding` por ser perigosa e dispensável. Manter apenas `admin_reset_onboarding` (reset individual) que é mais seguro.

### Arquivos alterados
- Nova migration SQL (correção de dados + rewrite de `get_or_create` + drop do bulk reset)

### Sem mudança no frontend
O `ProtectedRoute` e `useUserAccessState` estão corretos. O problema é exclusivamente dados corrompidos + falta de auto-reparo robusto.

