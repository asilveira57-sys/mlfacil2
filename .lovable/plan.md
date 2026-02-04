
Objetivo: eliminar o erro “new row violates row-level security policy for table ad_lifecycle_actions” ao criar rascunhos de ações (Clonar/Republicar/Encerrar) dentro do módulo Linha do Tempo, garantindo que o `workspace_id` usado no INSERT seja sempre um workspace válido do qual o usuário é membro.

## 1) Diagnóstico (origem do erro)
Pelos logs de rede, o INSERT em `ad_lifecycle_actions` está sendo feito com:
- `workspace_id = 433a4292-...` (que é o **user_id** do usuário autenticado)
- A política de segurança do banco exige que `workspace_id` esteja em um workspace onde `workspace_members.user_id = auth.uid()`.
- Como `workspace_id` está vindo como **user_id**, o banco retorna 403/RLS.

Evidência concreta (request body capturado):
```json
{
  "workspace_id": "433a4292-...",   // errado (é user_id)
  "ml_account_id": "997e5eb2-...",  // ok (uuid)
  "created_by": "433a4292-..."      // ok
}
```

## 2) Correção principal (robustez): resolver workspace dentro da mutation
Mesmo que a UI passe um `workspaceId` errado por qualquer motivo, o lugar mais seguro para corrigir é na própria mutation que faz o INSERT.

### 2.1) Ajustar `useCreateAction` (src/hooks/useAdTimeline.ts)
Implementar uma resolução interna de workspace “ativo” para o usuário:
1) `user_preferences.active_workspace_id` (prioridade)
2) fallback: primeiro `workspace_members.workspace_id`

Depois, usar **sempre** esse `workspace_id` resolvido no INSERT, em vez de confiar cegamente no `workspaceId` recebido via parâmetro.

Comportamento esperado:
- Se a tela mandar `workspaceId` errado (user_id), a mutation ignora/substitui e usa o workspace correto.
- Se não existir workspace ativo/membership, a mutation falha com erro claro (“Workspace não encontrado/sem acesso”).

## 3) Correção na UI do módulo Linha do Tempo (consistência)
Hoje o módulo está usando `useWorkspace()` para obter `currentWorkspace?.id`, mas os logs indicam que ainda existem fluxos onde o valor usado acaba sendo o `user.id`. Para padronizar e evitar divergência entre telas/estados:

### 3.1) Trocar a origem do workspaceId nas páginas do Timeline
Arquivos:
- `src/pages/AdTimelineRadar.tsx`
- `src/pages/AdTimelineDetail.tsx`

Trocar para o hook já existente e padronizado no projeto:
- `useCurrentWorkspaceId()` (que consulta `user_preferences.active_workspace_id` e faz fallback para `workspace_members`)

Assim, o Timeline passa a depender do mesmo “resolvedor” de workspace que já é o padrão de multi-tenant/RLS do app.

## 4) Corrigir outros pontos do app que ainda inserem `workspace_id = user.id`
Na busca do repositório, existem componentes de clonagem/concorrência criando ações com `workspace_id: user.id`, o que também dispara o mesmo erro de RLS quando usados.

Arquivos identificados como problemáticos:
- `src/components/competitor/CloneListingDialog.tsx` (usa `workspace_id: user.id`)
- `src/components/competitor/CloneCompetitorDialog.tsx` (usa `workspace_id: userId` e ainda usa `ml_account_id: sellerId` errado como tipo)

Plano para esses componentes:
- Reutilizar a mesma lógica de resolução de workspace (active_workspace_id → workspace_members fallback)
- Garantir `ml_account_id` como UUID (buscar `ml_accounts.id` pelo seller/ml_user_id e user_id)

Isso evita que o erro reapareça em outras áreas (“Concorrência”, “Clonar concorrente”, etc).

## 5) Validação (passo-a-passo)
Após implementar:
1) Abrir `/anuncios/linha-do-tempo/:itemId`
2) Tentar **Clonar** e **Republicar** → deve criar rascunho sem 403
3) Verificar na Central de Ações (`/anuncios/acoes`) se o rascunho aparece com `action_status = DRAFT`
4) Confirmar em Network que o POST usa `workspace_id = 1a86ab83-...` (workspace real) e não o `user_id`
5) Testar também a criação de rascunho a partir do Radar (tabela) e dos dialogs de Concorrência (se aplicável)

## 6) Escopo de mudanças (arquivos)
- Editar: `src/hooks/useAdTimeline.ts` (harden do `useCreateAction`)
- Editar: `src/pages/AdTimelineRadar.tsx` (workspaceId via `useCurrentWorkspaceId`)
- Editar: `src/pages/AdTimelineDetail.tsx` (workspaceId via `useCurrentWorkspaceId`)
- Editar: `src/components/competitor/CloneListingDialog.tsx` (workspaceId correto)
- Editar: `src/components/competitor/CloneCompetitorDialog.tsx` (workspaceId + ml_account_id corretos)

## 7) Por que isso resolve definitivamente
- A causa do erro é sempre a mesma: `workspace_id` inválido para RLS.
- Resolver dentro da mutation impede regressão mesmo que outra tela passe o ID errado.
- Padronizar o Timeline com `useCurrentWorkspaceId()` elimina inconsistência de origem do workspace no frontend.
