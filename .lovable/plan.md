
# Alterar periodo padrao de mensagens para 60 dias

## Objetivo
Mudar o periodo padrao de busca de mensagens pos-venda de 7/15/30 dias para **60 dias** em todos os pontos do sistema, para todas as contas.

## Alteracoes necessarias

### 1. Edge Function `ml-sync-messages` (sync manual pelo usuario)
**Arquivo:** `supabase/functions/ml-sync-messages/index.ts` (linha 192)
- **De:** `days_back = 30`
- **Para:** `days_back = 60`

### 2. Edge Function `qa-messages-polling-sync` (polling automatico)
**Arquivo:** `supabase/functions/qa-messages-polling-sync/index.ts` (linhas 289-291)
- **De:** `// Fetch recent orders (7 days)` / `dateFrom.getDate() - 7`
- **Para:** `// Fetch recent orders (60 days)` / `dateFrom.getDate() - 60`

### 3. Hook do frontend `useSyncPostSaleMessages` (chamada do botao de sync)
**Arquivo:** `src/hooks/usePostSaleConversations.ts` (linha 117)
- **De:** `daysBack = 15`
- **Para:** `daysBack = 60`

## Impacto
- O sync manual e o polling automatico passarao a buscar pedidos dos ultimos 60 dias na API do Mercado Livre
- Todas as contas serao afetadas igualmente (o valor eh global, nao por seller)
- O polling automatico levara mais tempo por conta (mais pedidos para processar), mas o timeout de 50s e os limites de 20 orders por conta no polling continuam protegendo contra estouro
