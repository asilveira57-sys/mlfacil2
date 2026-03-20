

# Plano: Corrigir exclusão completa de usuário no admin

## Problema raiz

Os logs mostram o erro exato:

```text
ERROR: update or delete on table "ml_accounts" violates foreign key constraint
"finance_accounts_ml_account_id_fkey" on table "finance_accounts" (SQLSTATE 23503)
```

A função `admin-delete-user` tenta excluir `ml_accounts` mas a tabela `finance_accounts` tem uma FK para `ml_accounts(id)` **sem ON DELETE CASCADE**. O mesmo erro acontece quando `auth.admin.deleteUser()` tenta cascatear a exclusão.

Resultado: o registro em `auth.users` permanece intacto e o seller continua logando normalmente.

## Tabelas com FK para ml_accounts (precisam ser limpas ANTES)

| Tabela | FK | Cascade? |
|---|---|---|
| `finance_accounts` | `ml_account_id → ml_accounts(id)` | Nao |
| `clone_drafts` | `ml_account_id → ml_accounts(id)` | ON DELETE SET NULL |
| `analyzed_items` | `ml_account_id → ml_accounts(id)` | ON DELETE SET NULL |
| `sync_jobs` | `ml_account_id → ml_accounts(id)` | Nao |
| `user_access_state` | `ml_account_id → ml_accounts(id)` | Nao |
| `listing_clone_drafts` | `destination_account_id → ml_accounts(id)` | Nao |

Tabelas com FK para `finance_accounts` (precisam ser limpas ANTES de `finance_accounts`):
- `finance_payments` (ON DELETE CASCADE)
- `finance_movements` (ON DELETE CASCADE)
- `finance_sync_jobs` (ON DELETE CASCADE)
- `finance_sync_runs` (ON DELETE CASCADE)

## Correção

### 1. Atualizar `admin-delete-user/index.ts`

Expandir a lista de tabelas para incluir TODAS as dependências na ordem correta de FK:

```text
Ordem de exclusão:
1. finance_payments, finance_movements, finance_sync_jobs, finance_sync_runs
2. finance_accounts
3. listing_clone_drafts, clone_drafts, analyzed_items, sync_jobs
4. ad_timeline_stats, ad_timeline_actions (se existirem com user_id)
5. security_events, user_security_settings
6. billing_info, notification_preferences, user_feature_flags
7. user_email_preferences, cookie_consents
8. seller_item_visits, seller_item_sales_daily, seller_item_sales_monthly, monthly_rankings
9. user_access_state
10. user_roles
11. ml_accounts
12. user_context
13. companies
14. profiles
15. auth.admin.deleteUser() — exclui auth.users
```

Adicionar tratamento de erro robusto: se `auth.admin.deleteUser()` falhar, retornar erro claro ao admin ao invés de silenciar.

### 2. Invalidar sessão imediatamente

Antes de deletar os dados, chamar `auth.admin.signOut(target_user_id)` (ou revogar todos os refresh tokens) para que o seller perca acesso imediatamente, mesmo que a exclusão de dados falhe parcialmente.

### Arquivo modificado

- `supabase/functions/admin-delete-user/index.ts`

Nenhuma tabela nova, nenhuma tela nova, nenhuma alteração de arquitetura.

