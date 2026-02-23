
# Corrigir Tarefas de Renovacao de Campanha

## Problemas Identificados

1. **Botao "Ver origem" desabilitado** - O botao na tela de detalhe da tarefa esta com `disabled` e nao navega para a campanha de origem
2. **Responsavel mostra UUID** - Em vez do nome do usuario, aparece `433a4292...` (trecho do UUID)
3. **Prazo nao definido** - A tarefa de renovacao nao recebe a data de finalizacao da campanha como prazo

## Alteracoes Tecnicas

### 1. `src/hooks/usePromotionTasks.ts` - Adicionar `due_at` e `assignee`

- Aceitar novo parametro opcional `endAt` (string ISO da data de fim da campanha) no `CreateTaskParams`
- Para tarefas do tipo `expiring`, usar `endAt` como `due_at` da tarefa
- Atribuir automaticamente o criador como responsavel (`assignee_user_id: user.id`)

### 2. `src/components/tasks/TaskDetail.tsx` - Resolver nome do responsavel e ativar "Ver origem"

**Responsavel com nome:**
- O componente ja recebe `members` (array de `WorkspaceMember`), porem esse tipo so tem `user_id`, sem nome
- Buscar o `full_name` da tabela `profiles` para cada membro, usando um hook ou query interna
- Exibir o nome no Select e nos comentarios/observadores em vez do UUID truncado

**Botao "Ver origem" funcional:**
- Quando `source_type === 'promotion'`, extrair `promotion_id` do `source_ref`
- Navegar para `/promocoes` (a pagina de promocoes) ao clicar
- Remover o atributo `disabled` quando houver `source_ref`

### 3. `src/pages/Promocoes.tsx` - Passar `endAt` ao criar tarefa

- Na chamada `handleCreateTask`, incluir o `end_at` da `selectedPromotion` como parametro

### 4. `src/types/tasks.ts` - Estender `WorkspaceMember` (opcional)

- Adicionar campo opcional `full_name?: string` ao tipo `WorkspaceMember` para suportar o nome resolvido

### Resumo de Arquivos

| Arquivo | Alteracao |
|---------|-----------|
| `src/hooks/usePromotionTasks.ts` | Novo param `endAt`, setar `due_at` e `assignee_user_id` |
| `src/pages/Promocoes.tsx` | Passar `selectedPromotion.end_at` no `handleCreateTask` |
| `src/components/tasks/TaskDetail.tsx` | Buscar nomes dos membros via `profiles`, ativar botao "Ver origem" com navegacao para `/promocoes` |
| `src/types/tasks.ts` | Adicionar `full_name?` ao `WorkspaceMember` |
| `src/hooks/useWorkspace.ts` | Join com `profiles` ao buscar members para trazer `full_name` |
