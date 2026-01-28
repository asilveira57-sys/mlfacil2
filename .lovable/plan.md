
# Plano: Corrigir Refresh Infinito + Menu Duplicado

## Diagnóstico Confirmado

Com base nos logs fornecidos pelo usuário:

```
[MOUNT] AppShellLayout
[NAV] AppShellLayout /dashboard
Failed to load resource: 409 (user_context upsert)
[CTX] ActiveAccountContext changed
[MOUNT] PageContainer
[UNMOUNT] PageContainer ← Desmonta logo após montar!
[NAV] RouteChangeCleanup
```

### Causas Identificadas:

1. **Erro 409 no upsert de `user_context`**: O `onConflict: 'user_id'` não funciona porque o Supabase JS client requer que o `onConflict` use o nome de uma constraint real, e `user_context_user_id_key` é um índice, não uma named constraint declarada com `UNIQUE (user_id)`.

2. **Loop no ActiveAccountContext**: O erro 409 dispara `console.warn` mas não impede re-execuções. O `persistActiveAccount` é chamado durante `initialize`, que pode ser reinvocado pelo `onAuthStateChange`.

3. **HeaderContent instável no Dashboard**: A constante `headerContent` (linhas 309-477) é um JSX gigante criado em cada render. Apesar do `PageContainer` usar ref, o próprio Dashboard remonta quando o contexto muda (devido ao erro 409 → change → re-render).

4. **Menu duplicado não existe mais**: A busca confirmou que nenhuma página usa `DashboardLayout` ou `SidebarProvider` internamente. O problema visual anterior foi corrigido.

---

## Correções Propostas

### 1. Corrigir Constraint do `user_context` (Database)

Adicionar constraint UNIQUE nomeada na coluna `user_id` para que o `upsert` funcione:

```sql
-- Remover o índice existente e criar constraint UNIQUE
DROP INDEX IF EXISTS user_context_user_id_key;

ALTER TABLE user_context 
  ADD CONSTRAINT user_context_user_id_unique UNIQUE (user_id);
```

O Supabase JS reconhece constraints nomeadas no `onConflict`.

### 2. Corrigir persistência non-blocking com guard de valor (ActiveAccountContext)

Adicionar ref para "último valor persistido" e só persistir quando realmente mudar:

```typescript
// Em ActiveAccountContext.tsx

// Ref para evitar persistência repetida do mesmo valor
const lastPersistedRef = useRef<{userId: string; accountId: string} | null>(null);

const persistActiveAccount = useCallback(async (userId: string, accountId: string, ...) => {
  // Guard: só persiste se o par (userId, accountId) mudou
  const lastPersisted = lastPersistedRef.current;
  if (lastPersisted?.userId === userId && lastPersisted?.accountId === accountId) {
    return; // Já persistido, não fazer nada
  }

  // Marcar como persistido ANTES de disparar a request
  lastPersistedRef.current = { userId, accountId };
  
  // Save to localStorage (fast-path)
  localStorage.setItem('active_account_id', accountId);
  localStorage.setItem('active_seller_id', account?.sellerId || '');

  // Best-effort DB save (fire-and-forget, não bloqueia)
  supabase
    .from('user_context')
    .upsert({...}, { onConflict: 'user_id' })
    .then(({ error }) => {
      if (error) {
        // Se falhar, limpar ref para permitir retry manual
        if (lastPersistedRef.current?.accountId === accountId) {
          lastPersistedRef.current = null;
        }
        if (import.meta.env.DEV) console.warn('[CTX] persist failed:', error.message);
      }
    });
}, []);
```

### 3. Memoizar headerContent no Dashboard

Mover o `headerContent` para um componente ou usar `useMemo`:

```typescript
// Em Dashboard.tsx

// Antes da linha 309, criar um componente separado ou useMemo:
const headerContent = useMemo(() => (
  <div className="flex items-center gap-2">
    {/* ... todo o JSX atual ... */}
  </div>
), [
  activeAccount,
  settingsOpen,
  // ... outras dependências reais
]);
```

Isso garante que `headerContent` tenha referência estável e só mude quando necessário.

### 4. Evitar re-initialize por TOKEN_REFRESHED

No `onAuthStateChange`, já está ignorando `TOKEN_REFRESHED`, mas garantir que `INITIAL_SESSION` não reinicialize:

```typescript
// Em ActiveAccountContext.tsx, linha 280-293
const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
  // Só reinicializar em SIGNED_IN real (não em refresh de token)
  if (event === 'SIGNED_IN' && !initializingRef.current && !initialized) {
    initializingRef.current = false;
    initialize();
  } else if (event === 'SIGNED_OUT') {
    setAccounts([]);
    setActiveAccountState(null);
    accountsRef.current = [];
    localStorage.removeItem('active_account_id');
    localStorage.removeItem('active_seller_id');
    setInitialized(false);
  }
  // Ignorar: TOKEN_REFRESHED, INITIAL_SESSION
});
```

### 5. Remover logs temporários após confirmação

Após validar que o loop parou:
- Remover `console.info("[MOUNT]...")` de todos os arquivos
- Manter apenas logs de erro (`console.error`, `console.warn`) em prod

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/migrations/...` | Criar constraint UNIQUE nomeada em user_context |
| `src/contexts/ActiveAccountContext.tsx` | Adicionar guard de persistência com ref |
| `src/pages/Dashboard.tsx` | Memoizar headerContent com useMemo |

---

## Critérios de Aceite

1. Console não mostra mais erro 409 no `user_context`
2. `[CTX] ActiveAccountContext changed` aparece no máximo 2 vezes por carregamento inicial (não em loop)
3. Navegar entre rotas não causa `[MOUNT] PageContainer` seguido imediatamente de `[UNMOUNT]`
4. Trocar de aba/janela não dispara re-renders visíveis
5. Menu aparece exatamente 1 vez em todas as páginas

---

## Seção Técnica

### Por que o upsert falha com 409?

O Supabase JS client, quando usa `upsert` com `onConflict`, requer que o nome do conflito corresponda a uma constraint real (PRIMARY KEY ou UNIQUE CONSTRAINT). O código atual usa:

```typescript
.upsert({...}, { onConflict: 'user_id' })
```

Mas a tabela `user_context` tem:
- `user_context_pkey` → PRIMARY KEY em `id` (não em `user_id`)
- `user_context_user_id_key` → UNIQUE INDEX (não constraint)

O Supabase não consegue mapear `user_id` para uma constraint, então trata como INSERT normal, que falha com 409 quando a linha já existe.

### Por que o headerContent causa loop?

O fluxo é:
1. Dashboard renderiza → cria novo `headerContent` (JSX)
2. PageContainer chama `setHeader(title, subtitle, headerContentRef.current)` via useEffect
3. AppShellLayout atualiza `headerState` com novo objeto
4. AppShellLayout re-renderiza
5. Dashboard (filho via Outlet) re-renderiza
6. Volta ao passo 1

O `headerContentRef` no PageContainer não previne o loop porque o problema está no pai (Dashboard) recriando o JSX e causando re-renders em cascata.
