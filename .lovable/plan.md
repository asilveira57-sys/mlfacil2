
# Plano: Eliminação de Refresh Automático no Frame Principal

## Contexto do Problema

O usuário reportou que a aplicação inteira recarrega (como um F5) em duas situações:
1. **Trocar de aba do navegador** (foco) 
2. **Navegar entre páginas no menu** (mudança de rota)

Após análise extensiva do código, identifiquei várias fontes potenciais de instabilidade que podem causar remontagem completa do componente raiz ou cascatas de re-renderização.

---

## Causa Raiz Identificada

### 1. Múltiplas chamadas `supabase.auth.getSession()` dispersas em useEffects

Encontrei **40+ arquivos** com chamadas diretas a `supabase.auth.getSession()` dentro de `useEffect` nas montagens de componentes. Quando essas chamadas disparam simultaneamente ao trocar de aba ou ao navegar, elas podem:
- Causar corridas (race conditions) com o auto-refresh do token do Supabase
- Disparar múltiplas re-renderizações em cascata
- Resultar em estados inconsistentes entre contextos

### 2. Hooks que reagem a `SIGNED_IN` durante Token Refresh

Embora os hooks ignorem `TOKEN_REFRESHED`, alguns hooks como `useUserRole` e `useUserAccessState` ainda chamam `fetchRole()` ou `fetchStatus()` no evento `SIGNED_IN`. Se o token expirar e for renovado entre abas, pode gerar um evento `SIGNED_IN` que dispara toda a cadeia de inicialização.

### 3. Chamadas de `getSession()` no `Dashboard.tsx` durante inicialização

O Dashboard.tsx faz chamadas diretas ao `supabase.auth.getSession()` em múltiplos `useEffect`, incluindo durante verificações de OAuth callback e sync debug, o que pode conflitar com os contextos globais.

### 4. Páginas com padrão inconsistente de verificação de auth

Páginas como `AdTimelineRadar.tsx`, `AdTimelineDetail.tsx` e `AdActionsCenter.tsx` usam o padrão `supabase.auth.getUser().then()` dentro de `useEffect` para obter o `workspaceId`, criando chamadas redundantes que podem causar re-renderizações.

---

## Plano de Correção

### Fase 1: Centralizar verificação de sessão no ActiveAccountContext

Todas as páginas e componentes devem usar o contexto global em vez de chamar `supabase.auth.getUser()` diretamente.

**Arquivos a modificar:**
- `src/pages/AdActionsCenter.tsx` - Remover `useEffect` com `getUser()`, usar `useActiveAccount()` para obter user.id
- `src/pages/AdTimelineRadar.tsx` - Mesmo padrão
- `src/pages/AdTimelineDetail.tsx` - Mesmo padrão  
- `src/pages/TarefaDetalhe.tsx` - Mesmo padrão

**Mudança padrão:**
```typescript
// ANTES (dispara getUser() na montagem)
const [workspaceId, setWorkspaceId] = useState<string | null>(null);
useEffect(() => {
  supabase.auth.getUser().then(({ data }) => {
    if (data.user) setWorkspaceId(data.user.id);
  });
}, []);

// DEPOIS (usa contexto centralizado)
const { activeAccountId } = useActiveAccount();
const workspaceId = activeAccountId; // Ou criar um hook dedicado useCurrentUserId()
```

### Fase 2: Criar hook utilitário `useCurrentUserId`

Criar um hook simples que expõe o `userId` de forma reativa a partir do contexto de autenticação global, evitando chamadas diretas ao Supabase.

**Novo arquivo:** `src/hooks/useCurrentUserId.ts`
```typescript
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

let cachedUserId: string | null = null;
let fetchPromise: Promise<string | null> | null = null;

export function useCurrentUserId(): string | null {
  const [userId, setUserId] = useState<string | null>(cachedUserId);

  useEffect(() => {
    if (cachedUserId) {
      setUserId(cachedUserId);
      return;
    }

    if (!fetchPromise) {
      fetchPromise = supabase.auth.getUser().then(({ data }) => {
        cachedUserId = data.user?.id || null;
        return cachedUserId;
      });
    }

    fetchPromise.then(setUserId);
  }, []);

  // Limpar cache no logout
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        cachedUserId = null;
        fetchPromise = null;
        setUserId(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  return userId;
}
```

### Fase 3: Aplicar Static Mode a hooks restantes

Alguns hooks críticos que ainda podem estar disparando refetch:

**Arquivos a verificar/corrigir:**
- `src/hooks/useNotificationSystem.ts` - As queries `useActiveNotifications`, `usePriorityNotifications` e `useNotificationCounts` precisam de Static Mode
- `src/hooks/useSellerCategories.ts` - Verificar configuração
- `src/hooks/useTrendsApi.ts` - Verificar configuração

**Configuração padrão a aplicar:**
```typescript
{
  staleTime: Infinity,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  refetchOnMount: false,
}
```

### Fase 4: Remover listeners `SIGNED_IN` redundantes em hooks

O evento `SIGNED_IN` pode ser disparado em situações inesperadas. Para hooks que já fazem fetch na montagem, o listener de `SIGNED_IN` é redundante e pode causar double-fetch.

**Arquivos a modificar:**
- `src/hooks/useUserRole.ts` - Remover refetch em `SIGNED_IN` (já faz fetch na montagem)
- `src/hooks/useUserAccessState.ts` - Mesmo padrão
- `src/hooks/useCollaboratorAccess.ts` - Mesmo padrão

---

## Ordem de Implementação

1. Criar `useCurrentUserId.ts` com cache global
2. Atualizar páginas de Ad Timeline para usar hook centralizado
3. Aplicar Static Mode nos hooks de notificação
4. Simplificar listeners de auth nos hooks de role/access
5. Testar navegação entre páginas e troca de abas

---

## Resultado Esperado

Após as correções:
- Trocar de aba NÃO deve causar reload da página
- Navegar no menu deve manter o shell (sidebar/header) estável
- Dados só atualizam com o botão "Atualizar dados" no header
- Sem chamadas redundantes ao `supabase.auth.getUser()`
