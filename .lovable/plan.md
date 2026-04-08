
# Resetar Onboarding para Usuários Importados (VETERANO)

## Problema
Usuários importados com tag VETERANO entram no sistema mas ficam sem empresa e sem conexão ML. Falta um mecanismo para o admin resetar o onboarding de qualquer usuário, forçando-o a passar pelo `/primeiro-acesso` novamente.

## Dados confirmados
- 99 VETERANO com `onboarding_status = 'pending'` (esses JÁ são redirecionados para `/primeiro-acesso`)
- 3 VETERANO com `onboarding_status = 'completed'` — destes, 1 (ADECONEX) completou sem conectar ML
- O fluxo de redirecionamento já funciona: `ProtectedRoute` manda para `/primeiro-acesso` quando `requiresOnboarding = true`

## Solução

### 1. Botão "Resetar Onboarding" no Admin Clientes
Adicionar uma nova ação no dropdown de cada cliente em `AdminClientes.tsx`:
- Ícone `RotateCcw` com texto "Resetar Onboarding"
- Ao clicar, executa uma RPC que:
  - Seta `user_access_state.onboarding_status = 'pending'`
  - Limpa flags derivadas que impediriam o fluxo
- Após sucesso, o próximo login do usuário o redireciona automaticamente para `/primeiro-acesso`

### 2. RPC `admin_reset_onboarding`
Criar uma função SQL `admin_reset_onboarding(target_user_id uuid)` que:
- Verifica se o chamador é admin (via `has_role`)
- Atualiza `user_access_state` do alvo: `onboarding_status = 'pending'`
- Retorna sucesso

### 3. Hook no frontend
Adicionar mutação `resetOnboarding` no hook `useAdminTrialManagement` (ou criar um dedicado) que chama a nova RPC.

### 4. Opção de reset em massa
Botão adicional no topo da lista para resetar todos os VETERANO com `onboarding_status = 'completed'` que não têm ML conectado (caso pontual).

## Arquivos afetados
- **Migration SQL**: Criar RPC `admin_reset_onboarding`
- **`src/hooks/useAdmin.ts`**: Adicionar mutação `resetOnboarding`
- **`src/pages/admin/AdminClientes.tsx`**: Adicionar item no dropdown de ações

## Resultado
- Admin pode forçar qualquer usuário a refazer o onboarding com um clique
- Na próxima vez que o usuário acessar, será redirecionado para `/primeiro-acesso` automaticamente
- O fluxo existente de onboarding (welcome → nome → empresa → plano → conexão) cuida do resto
