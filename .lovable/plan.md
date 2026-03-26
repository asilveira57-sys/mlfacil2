

## Plano: Adicionar "Último Acesso" na lista de clientes com expansão por conta ML

### Fonte de dados

Já existe infraestrutura pronta:
- `auth.users.last_sign_in_at` — último login do usuário (nível conta principal)
- `ml_accounts.created_at` — data de integração de cada conta ML
- `user_module_usage.last_seen_at` — último acesso por módulo (pode ser usado para pegar o MAX global por user)

### Implementação

#### 1. Migração SQL — Atualizar `admin_get_clients_overview()`

Adicionar dois campos novos ao retorno:
- `last_sign_in_at` (de `auth.users`) — último acesso do cliente
- Enriquecer `ml_accounts` com `created_at` (data de integração) por subconta

```sql
-- No subselect de ml_accounts, adicionar created_at:
jsonb_build_object(
  'id', ma.id,
  'nickname', ma.nickname,
  'ml_user_id', ma.ml_user_id,
  'connection_status', ma.connection_status,
  'is_active', ma.is_active,
  'created_at', ma.created_at   -- <-- NOVO
)

-- No SELECT principal, adicionar:
au.last_sign_in_at   -- <-- NOVO campo no RETURNS TABLE
```

Também adicionar um campo agregado `last_activity_at` usando `MAX(last_seen_at)` da tabela `user_module_usage` para capturar o último acesso real ao sistema (não apenas login).

#### 2. Hook `useAdminClients.ts`

Adicionar ao type:
```typescript
interface MlAccountInfo {
  // existentes...
  created_at: string | null;  // data de integração
}

interface AdminClient {
  // existentes...
  last_sign_in_at: string | null;   // último login
  last_activity_at: string | null;  // último acesso real
}
```

#### 3. Frontend `AdminClientes.tsx`

**Coluna "Último Acesso"** na tabela principal:
- Exibir `last_activity_at` (preferência) ou `last_sign_in_at` como fallback
- Formato: `dd/MM/yyyy HH:mm`

**Expansão por subconta (clientes com múltiplas contas ML)**:
- Ao clicar na linha de um cliente com 2+ contas ML, expandir linhas agrupadas mostrando:
  - Nickname da conta
  - Status de conexão (bolinha colorida)
  - Data de integração (`created_at` da ml_account)
  - Último acesso (usando `user_module_usage` filtrado por seller_id = ml_account.id)

Para o último acesso por subconta, adicionar ao subselect de `ml_accounts` na function SQL:
```sql
(SELECT MAX(umu.last_seen_at) FROM user_module_usage umu WHERE umu.seller_id = ma.id) as last_activity_at
```

### Arquivos modificados

| Arquivo | Ação |
|---|---|
| Nova migração SQL | Recriar `admin_get_clients_overview()` com campos novos |
| `src/hooks/useAdminClients.ts` | Adicionar types |
| `src/pages/admin/AdminClientes.tsx` | Coluna "Último Acesso" + expansão por subconta |

### Resultado
- Coluna "Último Acesso" visível na lista de clientes
- Clientes com múltiplas contas ML podem ser expandidos para ver data de integração e último acesso por subconta
- Dados reais, sem mock

