

## Diagnóstico

O problema está na lógica de decisão do Dashboard (linha 125-126 do `Dashboard.tsx`):

```tsx
const hasAnyAccount = accounts.length > 0;
```

Quando o seller faz login, o `ActiveAccountContext` carrega as contas do banco. Assim que `initialized=true` mas antes dos dados retornarem (ou quando o token está expirado e o status é `attention`/`disconnected`), `accounts` pode estar vazio momentaneamente ou o `activeAccount.status` pode ser `disconnected`. O resultado: o card "Conectar Mercado Livre" aparece como se fosse a primeira conexão, quando na verdade a conta já existia.

A solução é criar um componente `MLConnectionCard` com 4 estados explícitos e uma lógica de verificação inteligente que consulta o histórico de conexão antes de decidir o que mostrar.

---

## Plano

### 1. Criar componente `MLConnectionCard` com 4 estados

Novo arquivo `src/components/dashboard/MLConnectionCard.tsx` com os estados:
- **FIRST_CONNECTION**: nunca houve vínculo (`ml_accounts` vazio para o user)
- **RECONNECTING**: já houve vínculo, sistema está validando token
- **CONNECTED**: token válido, conta ativa
- **RECONNECT_REQUIRED**: validação falhou (token expirado, revogado, etc.)

O card terá visual moderno com animação no estado RECONNECTING (spinner + microcopy), informações da conta no CONNECTED, e CTA de reconexão no RECONNECT_REQUIRED.

### 2. Criar hook `useMLConnectionState`

Novo hook `src/hooks/useMLConnectionState.ts` que:
1. Ao montar, verifica se existem contas em `ml_accounts` para o usuário (via `ActiveAccountContext`)
2. Se `accounts.length === 0` e `initialized === true` → `FIRST_CONNECTION`
3. Se `accounts.length > 0` e status é `connected` → `CONNECTED`
4. Se `accounts.length > 0` e status é `attention` → `RECONNECTING` (dispara refresh em background)
5. Se refresh falhar → `RECONNECT_REQUIRED`
6. Se `accounts.length > 0` e status é `disconnected`/`revoked` → `RECONNECT_REQUIRED`
7. Enquanto não `initialized`, mantém estado `null` (loading geral do dashboard, sem card visível)

O hook registra eventos de log (`dashboard_connection_state_*`) em cada transição.

### 3. Atualizar `Dashboard.tsx`

Substituir a lógica atual de `hasAnyAccount`/`needsReconnect`/`DashboardOnboarding`/`DashboardReconnectingState` pelo novo `MLConnectionCard`:
- Se estado é `CONNECTED` → renderiza dashboard completo (KPIs, widgets, etc.)
- Se estado é outro → renderiza `MLConnectionCard` no lugar do conteúdo

### 4. Atualizar `Home.tsx` com a mesma lógica

Substituir o `DashboardOnboarding` no Home.tsx pela mesma lógica do `MLConnectionCard`.

### 5. Registrar eventos de auditoria

Cada transição de estado registra um evento na tabela `account_events`:
- `dashboard_connection_state_first_connection`
- `dashboard_connection_state_validating`
- `dashboard_connection_state_connected`
- `dashboard_connection_state_reconnect_required`

---

## Resumo de Alterações

| Arquivo | Mudança |
|---------|---------|
| `src/hooks/useMLConnectionState.ts` | Novo hook com máquina de estados |
| `src/components/dashboard/MLConnectionCard.tsx` | Novo componente com 4 estados visuais |
| `src/pages/Dashboard.tsx` | Substituir lógica antiga pelo novo card |
| `src/pages/Home.tsx` | Substituir `DashboardOnboarding` pelo novo card |
| `src/components/dashboard/index.ts` | Exportar novo componente |

### Fluxo Final
```text
Login → Dashboard carrega → ActiveAccountContext inicializa
  → accounts.length === 0 → FIRST_CONNECTION (card com CTA)
  → accounts.length > 0 + status connected → CONNECTED (dashboard completo)
  → accounts.length > 0 + status attention → RECONNECTING (validando token)
    → refresh OK → CONNECTED (transição automática)
    → refresh falhou → RECONNECT_REQUIRED (card com CTA reconectar)
  → accounts.length > 0 + status revoked/disconnected → RECONNECT_REQUIRED
```

