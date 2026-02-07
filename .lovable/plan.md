
# Diagnostico: Problemas no Modulo de Mensagens Pos-Venda

## Resumo dos Problemas Encontrados

Apos analise detalhada dos logs, banco de dados, edge functions e configuracoes, identifiquei **causas-raiz claras** para ambos os problemas. Nenhum deles eh causado por bloqueio do Mercado Livre.

---

## Problema 1: Mensagem de Boas Vindas NAO esta sendo enviada

### Causa Principal: 3 falhas em cadeia impedem o envio

**Falha A - Feature flag `can_sync_orders` esta DESLIGADA**

A tabela `ml_integrations` para o seller `66043362` tem:
```text
can_sync_items: true
can_sync_orders: FALSE   <-- bloqueando!
can_sync_messages: FALSE <-- bloqueando!
can_sync_questions: FALSE
```

Todos os webhooks de `orders_v2` recebidos estao sendo **marcados como "skipped"** pelo worker com motivo `feature_not_enabled`. Confirmei nos dados: dezenas de eventos recentes com `status: skipped`.

**Falha B - `processOrderEvent` eh um placeholder**

Mesmo se a feature flag estivesse ativa, a funcao `processOrderEvent` no worker (`ml-worker-process`) NAO faz nada util:
```text
Linha 537-543: apenas loga "Order event received" e retorna success
Nao consulta post_sale_automation_rules
Nao busca templates
Nao dispara envio de mensagem
```

**Falha C - Nao existe implementacao do Action Guide API**

A API do Mercado Livre **exige** o endpoint `/messages/action_guide` para enviar a primeira mensagem ao comprador (quando o comprador ainda nao enviou nada). O endpoint padrao POST `/messages/packs/{id}` retorna erro para conversas ineditas. O proprio screenshot do ML mostra: "Voce so pode enviar esta mensagem uma vez".

Atualmente, `ml-send-message` usa apenas o endpoint padrao - nunca funcionaria para Boas Vindas.

### Solucao Necessaria

1. Ativar `can_sync_orders: true` e `can_sync_messages: true` no `ml_integrations`
2. Implementar logica real em `processOrderEvent` que:
   - Consulta `post_sale_automation_rules` ativas para o trigger `venda_confirmada`
   - Busca o template vinculado
   - Se `require_approval = true`: cria rascunho na tabela `post_sale_messages` com status `pendente`
   - Se `require_approval = false`: envia automaticamente via Action Guide
3. Implementar endpoint Action Guide no `ml-send-message`:
   - `POST /messages/action_guide/packs/{pack_id}/sellers/{seller_id}`
   - Com uma das razoes permitidas: `DELIVERY_PROMISE`, `OTHER`, etc.
   - Restrição critica: apos enviar essa primeira mensagem, deve aguardar resposta do comprador

---

## Problema 2: Mensagens antigas NAO estao sendo trazidas

### Causa Principal: API retorna 404 para pedidos sem conversa existente

**Evidencia dos logs:**
```text
[polling] 66043362: 20 recent orders for message sync
[polling] 66043362: 0 conversations, 0 new unreads
```

O sistema busca 20 pedidos dos ultimos 60 dias e tenta buscar mensagens para cada um. Para TODOS os 20, a API `/messages/packs/{packId}/sellers/{sellerId}?tag=post_sale` retorna **non-200** (provavelmente 404 = "nao ha conversa para este pack").

**O codigo silencia TODOS os erros:**
```typescript
// Linha 322 do qa-messages-polling-sync:
if (!msgRes.ok) continue;  // Pula silenciosamente QUALQUER erro
```

Isso significa que 403, 400, 404 sao todos ignorados sem log, impossibilitando diagnostico.

**Existem apenas 1 conversa no banco** (status: `blocked`) e 2 mensagens. Isso confirma que a sincronizacao nunca funcionou corretamente em larga escala.

**Outras causas contribuintes:**

- `MAX_ORDERS_PER_ACCOUNT = 20` eh muito baixo para cobrir 60 dias de historico
- A segunda conta (`1667452966` / MLFACIL_CONSULTORIA) nao tem registro em `ml_integrations`, fazendo seus webhooks falharem com `UNKNOWN_SELLER`
- O sync manual (`ml-sync-messages`) aparentemente nao esta sendo usado (zero logs recentes)

### Solucao Necessaria

1. Adicionar logging detalhado para respostas non-200 da API de mensagens:
   ```text
   if (!msgRes.ok) {
     console.log(`[polling] Messages API ${msgRes.status} for pack ${packId}`);
     continue;
   }
   ```
2. Aumentar `MAX_ORDERS_PER_ACCOUNT` de 20 para 50 (com controle de timeout)
3. Criar registro `ml_integrations` para a conta `1667452966` com flags corretas
4. Usar endpoint alternativo `/messages/unread` para buscar mensagens recentes em vez de iterar por pedido (mais eficiente)
5. Corrigir o `ml-sync-messages` (manual) que tambem pode estar silenciando erros

---

## Tabela Resumo de Causas

```text
| Problema               | Causa                                    | Tipo       | Solucao                          |
|------------------------|------------------------------------------|------------|----------------------------------|
| Boas Vindas nao envia  | can_sync_orders = false                  | Config     | Atualizar ml_integrations        |
| Boas Vindas nao envia  | processOrderEvent eh placeholder         | Codigo     | Implementar logica de automacao  |
| Boas Vindas nao envia  | Falta Action Guide API                   | Codigo     | Implementar endpoint no ML API   |
| Msgs antigas ausentes  | API 404 para packs sem conversa          | Esperado   | Adicionar logging + tratamento   |
| Msgs antigas ausentes  | MAX_ORDERS = 20 (muito baixo)            | Config     | Aumentar para 50                 |
| Msgs antigas ausentes  | Erros silenciados no polling             | Codigo     | Adicionar logging detalhado      |
| Msgs antigas ausentes  | Conta 1667452966 sem ml_integrations     | Config     | Criar registro com flags ativas  |
```

---

## Plano de Implementacao

### Fase 1 - Correcoes de configuracao (banco de dados)

- Atualizar `ml_integrations` do seller `66043362`: ativar `can_sync_orders`, `can_sync_messages`, `can_sync_questions`
- Criar `ml_integrations` para seller `1667452966` com flags ativas

### Fase 2 - Logging e diagnostico

- Adicionar logs detalhados em `qa-messages-polling-sync` para respostas non-200
- Adicionar logs em `ml-sync-messages` para respostas non-200
- Aumentar `MAX_ORDERS_PER_ACCOUNT` de 20 para 50

### Fase 3 - Implementar automacao de Boas Vindas

- Implementar `processOrderEvent` no `ml-worker-process` para:
  - Buscar dados do pedido na API do ML
  - Consultar `post_sale_automation_rules` ativas para `venda_confirmada`
  - Buscar template vinculado e interpolar variaveis
  - Validar conteudo contra `post_sale_blocked_patterns`
  - Se `require_approval = true`: criar rascunho em `post_sale_messages` com status `pendente`
  - Se `require_approval = false`: enviar via Action Guide API

### Fase 4 - Implementar Action Guide API

- Adicionar suporte ao endpoint Action Guide no `ml-send-message`:
  - Detectar se a conversa eh inedita (sem mensagens do comprador)
  - Usar `POST /messages/action_guide/packs/{pack_id}/sellers/{seller_id}`
  - Payload: `{ from: { user_id }, to: { user_id }, text, reason: "DELIVERY_PROMISE" }`
  - Tratar restricao de mensagem unica ate resposta do comprador

### Fase 5 - Frontend para aprovacao de rascunhos

- Adicionar aba ou indicador na tela de Conversas para mensagens pendentes de aprovacao
- Permitir aprovar/editar/rejeitar rascunhos de Boas Vindas antes do envio

---

## Arquivos a Modificar

| Arquivo | Acao |
|---------|------|
| Migracao SQL | Atualizar ml_integrations feature_flags |
| `supabase/functions/ml-worker-process/index.ts` | Implementar processOrderEvent com automacao |
| `supabase/functions/ml-send-message/index.ts` | Adicionar suporte Action Guide API |
| `supabase/functions/qa-messages-polling-sync/index.ts` | Adicionar logging + aumentar MAX_ORDERS |
| `supabase/functions/ml-sync-messages/index.ts` | Adicionar logging para erros silenciados |
