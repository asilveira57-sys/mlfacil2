
# Plano: Corrigir Busca de Ações na Central de Ações

## Problema Identificado
A página "Central de Ações" (`AdActionsCenter.tsx`) está usando o **ID do usuário** para buscar ações, mas os registros são salvos com o **workspace_id** correto. Isso causa a desconexão — o rascunho existe no banco, mas a página não consegue encontrá-lo.

### Dados no Banco (confirmado)
- **Item**: `MLBU1436905343`
- **Status**: `DRAFT`
- **workspace_id**: `1a86ab83-df87-43b0-a888-055f04314c4b`

### Código Atual (incorreto)
```typescript
// AdActionsCenter.tsx linha 62
const workspaceId = useCurrentUserId(); // Retorna user.id, não workspace_id!
```

---

## Solução

### 1. Criar Hook `useCurrentWorkspaceId`
Um novo hook que resolve o workspace ativo do usuário, seguindo a mesma lógica já usada no `CloneByLinkDialog`:
- Primeiro tenta `user_preferences.active_workspace_id`
- Se não encontrar, busca o primeiro `workspace_id` em `workspace_members`

### 2. Atualizar `AdActionsCenter.tsx`
Trocar `useCurrentUserId()` por `useCurrentWorkspaceId()` para que a busca de ações use o workspace correto.

### 3. Invalidar Cache Após Criação
Adicionar invalidação do cache do React Query no `CloneByLinkDialog` após criar um rascunho com sucesso, garantindo que a lista seja atualizada automaticamente.

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/hooks/useCurrentWorkspaceId.ts` | **Criar** - Novo hook para resolver workspace ativo |
| `src/pages/AdActionsCenter.tsx` | Trocar `useCurrentUserId` por `useCurrentWorkspaceId` |
| `src/components/ad-timeline/CloneByLinkDialog.tsx` | Adicionar invalidação do cache após inserção |

---

## Detalhes Técnicos

### Hook `useCurrentWorkspaceId`
```typescript
// Lógica de resolução:
// 1. Buscar user_preferences.active_workspace_id
// 2. Fallback: primeiro workspace_members.workspace_id
// 3. Cache em memória para evitar chamadas repetidas
```

### Invalidação de Cache
Após criar o rascunho com sucesso:
```typescript
import { useQueryClient } from '@tanstack/react-query';

// No CloneByLinkDialog, após insert bem-sucedido:
queryClient.invalidateQueries({ queryKey: ['ad-lifecycle-actions'] });
```

---

## Resultado Esperado
Após a correção:
1. A Central de Ações buscará ações pelo **workspace_id** correto
2. O rascunho `MLBU1436905343` aparecerá na aba "Rascunhos"
3. Novos rascunhos criados aparecerão imediatamente na lista
