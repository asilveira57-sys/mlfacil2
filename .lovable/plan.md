

# Plano: Corrigir post-its e tarefas para novos usuários

## Problema

A função `ensure_workspace` (que cria workspace, user_preferences e workspace_members para novos usuários) **só é chamada na página de Tarefas** (`useUserPreferences` → usado apenas em `Tarefas.tsx`).

Novos sellers que tentam criar post-its ou tarefas via outros módulos usam `useCurrentWorkspaceId`, que apenas **consulta** as tabelas `user_preferences` e `workspace_members` — sem criar nada. Como o workspace nunca foi criado, `workspaceId` retorna `null`, e os inserts nas tabelas `notes` e `tasks` falham silenciosamente (o código verifica `if (!workspaceId) return`).

## Correção

### 1. Mover `ensure_workspace` para dentro de `useCurrentWorkspaceId`

**Arquivo:** `src/hooks/useCurrentWorkspaceId.ts`

Quando as duas consultas (user_preferences e workspace_members) retornarem `null`, chamar `supabase.rpc('ensure_workspace', { p_user_id: userId })` como fallback final. A função RPC já é idempotente e `SECURITY DEFINER`, então é segura para ser chamada a qualquer momento.

Após a chamada, retornar o `active_workspace_id` do resultado.

Isso garante que **qualquer módulo** que dependa de `useCurrentWorkspaceId` (notes, post-its, ad actions, templates, etc.) terá um workspace válido automaticamente.

### 2. Nenhuma outra alteração necessária

- A função `ensure_workspace` já existe no banco e é idempotente
- Os hooks de notes/tasks já verificam `workspaceId` antes de operar
- Nenhuma migration necessária

## Arquivos modificados

- `src/hooks/useCurrentWorkspaceId.ts` — adicionar fallback com `ensure_workspace` RPC

