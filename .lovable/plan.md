
# Auto-resolucao de Pendencias (Notificacoes) baseada no estado real dos modulos

## Problema identificado

Existem **dois problemas** no modulo de Pendencias Prioritarias:

1. **Perguntas ja respondidas continuam como pendencias**: O sistema cria notificacoes `qa_pending` quando perguntas chegam, e o sync (`qa-messages-polling-sync`) faz a reconciliacao das perguntas no banco (marca como `answered`), mas **nunca resolve as notificacoes correspondentes**. O seller 66043362 (Etiqueta Capixaba) tem 117 perguntas, todas com status `answered`, mas 7 notificacoes `qa_pending` ainda aparecem.

2. **"Mensagem de boas-vindas pendente" sem mensagens pendentes reais**: O worker cria notificacoes `post_sale_blocked` para drafts pendentes, mas quando o draft e enviado ou descartado, a notificacao permanece. Alem disso, o `action_url` aponta para `/mensagens-pos-venda`, que funciona corretamente (nao e 404). O 404 pode ocorrer se a navegacao estiver sendo interceptada de outra forma.

## Solucao

### 1. Auto-resolver notificacoes `qa_pending` quando nao ha mais perguntas pendentes

**Onde**: `supabase/functions/qa-messages-polling-sync/index.ts`

Apos o sync de perguntas de cada conta, verificar se o `pendingCount` resultante e **zero**. Se for, buscar todas as notificacoes `qa_pending` nao resolvidas para aquele seller e marca-las como `is_actioned = true`.

```text
Fluxo atual:
  syncQuestions() -> retorna pendingCount
  se newCount > 0: cria/atualiza notificacao

Fluxo proposto:
  syncQuestions() -> retorna pendingCount
  se newCount > 0: cria/atualiza notificacao
  se pendingCount == 0: resolver TODAS notificacoes qa_pending do seller
```

### 2. Auto-resolver notificacoes `post_sale_blocked` quando nao ha drafts pendentes

**Onde**: `supabase/functions/ml-worker-process/index.ts` e `src/hooks/usePostSalePendingMessages.ts`

**Backend**: Quando o worker processa um evento e detecta que nao ha mais mensagens pendentes para aquele seller, resolver notificacoes `post_sale_blocked`.

**Frontend**: Quando o usuario aprova ou descarta um draft (via `useApprovePendingMessage` ou `useRejectPendingMessage`), apos a invalidacao de queries, verificar se restam pendencias e resolver notificacoes se necessario.

### 3. Invalidar cache de notificacoes ao resolver

**Onde**: `src/hooks/usePostSalePendingMessages.ts` e `src/hooks/useRejectAllPendingMessages.ts`

Adicionar invalidacao das queries `priority-notifications` e `notification-counts` quando drafts sao aprovados/rejeitados, para que o PriorityInbox atualize imediatamente.

## Detalhamento tecnico

### Arquivo 1: `supabase/functions/qa-messages-polling-sync/index.ts`

Apos a chamada `syncQuestions()` (linha ~654), adicionar logica de auto-resolve:

```typescript
// Apos sync de perguntas
if (qResult.pendingCount === 0) {
  // Nenhuma pergunta pendente - resolver todas notificacoes qa_pending do seller
  await supabase
    .from('app_notifications')
    .update({ is_actioned: true, read_at: new Date().toISOString() })
    .eq('seller_id', account.ml_user_id)
    .eq('category', 'qa_pending')
    .eq('is_actioned', false);
}
```

### Arquivo 2: `supabase/functions/ml-worker-process/index.ts`

Apos criar/atualizar notificacao de post_sale (linha ~894), adicionar verificacao similar quando mensagens sao processadas. Tambem adicionar auto-resolve nas funcoes de envio/bloqueio quando o count de pendentes cai a zero.

### Arquivo 3: `src/hooks/usePostSalePendingMessages.ts`

No `onSuccess` de `useApprovePendingMessage` e `useRejectPendingMessage`, adicionar:
- Invalidacao de `priority-notifications` e `notification-counts`
- Chamada para auto-resolver notificacoes `post_sale_blocked` se nao restarem pendencias

### Arquivo 4: `src/hooks/useRejectAllPendingMessages.ts`

Mesmo tratamento: invalidar caches de notificacao e resolver notificacoes post_sale quando todos os drafts sao descartados.

### Arquivo 5: Criar funcao utilitaria `src/lib/notifications/autoResolve.ts`

Funcao reutilizavel para resolver notificacoes por categoria e seller:

```typescript
export async function autoResolveNotifications(
  category: string,
  sellerId: string
) {
  await supabase
    .from('app_notifications')
    .update({ is_actioned: true })
    .eq('seller_id', sellerId)
    .eq('category', category)
    .eq('is_actioned', false);
}
```

### Limpeza imediata dos dados

Executar uma query de limpeza para resolver as notificacoes orfas atuais no banco:

```sql
-- Resolver notificacoes qa_pending para sellers sem perguntas pendentes
UPDATE app_notifications
SET is_actioned = true
WHERE category = 'qa_pending'
  AND is_actioned = false
  AND seller_id NOT IN (
    SELECT DISTINCT seller_id FROM qa_questions WHERE status = 'pending'
  );

-- Resolver notificacoes post_sale_blocked para sellers sem drafts pendentes
UPDATE app_notifications
SET is_actioned = true
WHERE category = 'post_sale_blocked'
  AND is_actioned = false
  AND seller_id NOT IN (
    SELECT DISTINCT seller_id FROM post_sale_messages
    WHERE is_visible = true AND status IN ('pendente', 'rascunho')
  );
```

## Resumo de arquivos impactados

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/qa-messages-polling-sync/index.ts` | Auto-resolver `qa_pending` quando pendingCount = 0 |
| `supabase/functions/ml-worker-process/index.ts` | Auto-resolver `post_sale_blocked` quando count = 0 |
| `src/lib/notifications/autoResolve.ts` | Nova funcao utilitaria (frontend) |
| `src/hooks/usePostSalePendingMessages.ts` | Invalidar caches + auto-resolve no frontend |
| `src/hooks/useRejectAllPendingMessages.ts` | Invalidar caches + auto-resolve no frontend |
| Migration SQL | Limpeza de notificacoes orfas existentes |
