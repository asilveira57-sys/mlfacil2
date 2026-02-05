# Plano: Unificação de Conta Ativa

## Status: ✅ CONCLUÍDO (05/02/2026)

## Contexto Original
Existiam dois sistemas diferentes de conta selecionada:
1. Seletor global (AccountSwitcher) que atualiza ActiveAccountContext
2. Módulo de Pós-Venda com seletor próprio baseado em useMlAccounts + localStorage

O useMlAccounts filtrava por `is_active = true`, causando inconsistência onde trocar a conta no topo não alterava o seller_id usado pelo módulo de mensagens.

## Mudanças Implementadas

### 1. Frontend - PostSaleConversationsTab ✅
- Removido `useMlAccounts` + localStorage local (`post-sale-selected-account`)
- Agora usa `useActiveAccount()` como fonte única de verdade
- `sellerId` deriva de `activeAccount?.sellerId`
- Seletor de conta agora chama `setActiveAccount()` do contexto
- Reseta conversa selecionada ao trocar conta

### 2. Hook useMlAccounts ✅
- Removido filtro `is_active = true` (era usado erroneamente como "selecionada")
- Adicionado parâmetro opcional `onlyConnected` para filtrar por `connection_status`
- Agora retorna todas as contas do usuário por padrão

### 3. Hook usePostSaleConversations ✅
- Atualizado para aceitar `accountId` (UUID) para lookup de credenciais
- `useSyncPostSaleMessages` agora passa `account_id` para a edge function
- `useSendPostSaleMessage` também envia `account_id`
- Toast de sincronização inclui `seller_id` para debug

### 4. Cache Invalidation ✅
- Criado `useAccountChangeInvalidation` hook
- Escuta evento `active_account_changed` (disparado por `setActiveAccount`)
- Invalida queries: `post-sale-*`, `ads`, `orders`, `costs`, `questions`, `billing`
- Componente `AccountChangeInvalidator` adicionado no App.tsx

### 5. Edge Functions ✅
- **ml-sync-messages**: 
  - Nova função `getMLAccountCredentials()` com lookup unificado
  - Prioriza `account_id` (UUID), fallback para `seller_id`
  - Validação de ownership: `user_id` do JWT
  - Usa `connection_status` ao invés de `is_active`
  - Mantém sanity check do token (users/me)

- **ml-send-message**:
  - Mesma função `getMLAccountCredentials()` 
  - Aceita `account_id` ou `seller_id`
  - Validação de ownership implementada

## Arquivos Modificados
- `src/hooks/useMlAccounts.ts`
- `src/hooks/usePostSaleConversations.ts`
- `src/hooks/useAccountChangeInvalidation.ts` (novo)
- `src/components/post-sale/PostSaleConversationsTab.tsx`
- `src/components/layout/AccountChangeInvalidator.tsx` (novo)
- `src/App.tsx`
- `supabase/functions/ml-sync-messages/index.ts`
- `supabase/functions/ml-send-message/index.ts`

## Como Funciona Agora
1. Usuário seleciona conta no seletor global (topo)
2. `ActiveAccountContext` atualiza `activeAccount` e dispara evento `active_account_changed`
3. `AccountChangeInvalidator` limpa caches de React Query
4. Módulo Pós-Venda lê `sellerId` do contexto
5. Edge functions buscam credenciais por `account_id` (prioritário) ou `seller_id`
6. Validação de ownership garante que o token pertence ao usuário autenticado

## Critérios de Aceite ✅
- [x] Conta do seletor global é usada para listar/sincronizar/enviar mensagens
- [x] Trocar conta altera dados imediatamente (sem hard refresh)
- [x] Não existe mais localStorage conflitante
- [x] Edge functions usam `account_id` preferencialmente
- [x] Validação de ownership em todas as operações

## Próximos Passos (Opcional)
- Aplicar mesmo padrão em outras edge functions: `ml-sync-questions`, `ml-answer-question`, `ml-sync-billing-details`, `ml-sync-real-costs`
- Higienizar dados: alinhar `is_active` com `connection_status` na tabela `ml_accounts`
