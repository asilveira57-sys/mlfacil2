
# Plano: Corrigir Violação de RLS na Criação de Ações

## Diagnóstico

O erro `"new row violates row-level security policy for table 'ad_lifecycle_actions'"` ocorre porque:

| Variável | Valor Atual (incorreto) | Valor Esperado (correto) |
|----------|-------------------------|--------------------------|
| `workspaceId` | User ID: `433a4292-...` | Workspace ID: `1a86ab83-df87-43b0-...` |

### Causa Raiz

A página `AdTimelineRadar.tsx` (linha 150) usa:
```javascript
const workspaceId = useCurrentUserId();
```

Mas `useCurrentUserId()` retorna o **ID do usuário autenticado**, não o ID do workspace.

### Política RLS em `ad_lifecycle_actions`

A tabela exige que o `workspace_id` do novo registro pertença a um workspace onde o usuário é membro:

```sql
-- INSERT policy:
WITH CHECK (
  workspace_id IN (
    SELECT w.id FROM workspaces w
    JOIN workspace_members wm ON wm.workspace_id = w.id
    WHERE wm.user_id = auth.uid()
  )
)
```

Como `useCurrentUserId()` retorna `433a4292-...` (user_id) em vez de `1a86ab83-...` (workspace_id real), a política falha.

---

## Solução

Substituir `useCurrentUserId()` por `useWorkspace().currentWorkspace?.id` nas páginas do módulo Linha do Tempo.

---

## Alterações Necessárias

### 1. `src/pages/AdTimelineRadar.tsx`

**Antes (linha 150):**
```javascript
import { useCurrentUserId } from "@/hooks/useCurrentUserId";
// ...
const workspaceId = useCurrentUserId();
```

**Depois:**
```javascript
import { useWorkspace } from "@/hooks/useWorkspace";
// ...
const { currentWorkspace } = useWorkspace();
const workspaceId = currentWorkspace?.id || null;
```

### 2. `src/pages/AdTimelineDetail.tsx`

**Antes (linha 36):**
```javascript
import { useCurrentUserId } from "@/hooks/useCurrentUserId";
// ...
const workspaceId = useCurrentUserId();
```

**Depois:**
```javascript
import { useWorkspace } from "@/hooks/useWorkspace";
// ...
const { currentWorkspace } = useWorkspace();
const workspaceId = currentWorkspace?.id || null;
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/AdTimelineRadar.tsx` | Trocar `useCurrentUserId` por `useWorkspace` |
| `src/pages/AdTimelineDetail.tsx` | Trocar `useCurrentUserId` por `useWorkspace` |

---

## Impacto

- **Baixo risco**: Apenas alteração de qual hook é usado
- **Sem alteração de schema ou RLS**: As políticas já estão corretas
- **Consistência**: Segue o mesmo padrão usado em outras páginas (`Tarefas.tsx`, `SupportTicketList.tsx`)

## Resultado Esperado

Após a correção:
- Criar rascunhos de ações funcionará corretamente
- O `workspace_id` correto será usado em todas as operações
- A política RLS será satisfeita
