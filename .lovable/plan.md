
## Diagnóstico (por que está dando 500 e “comendo créditos”)
1) **O erro não é (ainda) bloqueio da API do Mercado Livre**.  
   Pelos logs do backend, o `ml-sync-messages` falha antes de chamar a API do ML, ao tentar ler o cache de pedidos:
   - `column meli_orders_cache.buyer_id does not exist`

2) **A query do `ml-sync-messages` está pedindo colunas que não existem no seu cache** (`meli_orders_cache`):  
   Hoje o `ml-sync-messages` tenta buscar:
   - `buyer_id` (não existe)
   - `item_title` (não existe)
   - `item_thumbnail` (não existe)
   E por isso a consulta retorna erro, e a função devolve `500`.

3) Isso “come créditos” porque **cada clique em “Sincronizar Mensagens” executa uma função no backend**, que está falhando imediatamente. Ou seja: muitas tentativas = muitos créditos desperdiçados.

4) Há ainda um risco adicional: **você tem mais de uma conta ML ativa**. O módulo hoje pega `mlAccounts[0]` (primeira da lista), que pode não ser a conta certa. Mesmo depois de corrigir o erro 500, isso pode resultar em “nenhuma conversa encontrada” por estar sincronizando o seller errado.

---

## Objetivo do ajuste
- **Parar o erro 500 imediatamente** (corrigir a query do cache).
- **Garantir que dá para identificar o buyer_id** mesmo sem `buyer_id` no cache (inferir pelo histórico de mensagens retornado pela API).
- **Evitar bloqueios e erros de API** em contas com muitos pedidos (sincronização “resumível”/paginada, com estado no banco e limites de tempo/quantidade por execução).
- **Reduzir desperdício de créditos** (cooldown, evitar concorrência, não rodar sync idêntico repetidamente).

---

## Plano de correção (implementação)

### Fase A — Hotfix para parar o 500 agora (sem depender de “API do ML”)
1) **Ajustar a query do cache de pedidos no `ml-sync-messages`**
   - Trocar o `.select()` para apenas colunas que realmente existem em `meli_orders_cache`:
     - `order_id, buyer_name, buyer_nickname, shipment_id, created_at_meli, order_status`
   - Remover `buyer_id, item_title, item_thumbnail` desse select (porque não existem na tabela).

2) **Enriquecer “item_title” e “item_thumbnail” via `meli_order_items_cache` (opcional, mas recomendado)**
   - Buscar itens em lote:
     - `from("meli_order_items_cache").select("order_id,title,thumbnail").in("order_id", orderIds)`
   - Escolher o “primeiro item” por `order_id` como título/thumbnail da conversa.
   - Se não houver item, manter `null`.

3) **Inferir `buyer_id` sem depender do cache**
   - Como a API de mensagens retorna `from.user_id` e `to.user_id`, dá para determinar o comprador assim:
     - `sellerUserId = Number(seller_id)`
     - `buyer_id = primeiro user_id encontrado nas mensagens que seja diferente do sellerUserId`
   - Unread count:
     - contar mensagens onde `from.user_id !== sellerUserId` e `message_date.read` está vazio.
   - `last_message_from`:
     - se `lastMessage.from.user_id === sellerUserId` => `"seller"` senão `"buyer"`.

4) **Evitar que erros “de banco” virem 500 genérico**
   - Alterar respostas de erro “operacionais” (ex.: falha de query, falta de dados) para retornar **HTTP 200 com `{ success:false, error_code, error, execution_logs }`**.
   - Benefício: o frontend consegue mostrar o motivo real e não gera a mensagem genérica “non-2xx status code”.

Resultado esperado após a Fase A:
- Clicar em “Sincronizar Mensagens” não dá mais 500 por schema mismatch.
- Se existir histórico na API do ML, as conversas começam a aparecer.

---

### Fase B — Reduzir consumo de créditos e evitar bloqueio/rate limit da API (resumable sync)
Mesmo com a Fase A, contas com muitos pedidos podem:
- estourar tempo de execução
- sofrer throttling (429) ou intermitências
- exigir várias execuções

Para resolver “sem bloqueio ou erro de API”, implementar sincronização **resumível**:

1) **Criar uma tabela de estado de sincronização** (ex.: `post_sale_messages_sync_state`)
   Campos sugeridos:
   - `user_id`, `seller_id`
   - `status`: `idle | running | paused | done | error`
   - `cursor_created_at_meli` e `cursor_order_id` (paginação “keyset”)
   - `processed_orders`, `synced_conversations`, `last_heartbeat_at`
   - `last_success_at`, `last_error_code`, `last_error_message`
   - Índice por `(user_id, seller_id)`

2) **Modificar `ml-sync-messages` para processar “lotes” com limite de tempo**
   - Definir limites:
     - `MAX_RUNTIME_MS` (ex.: 45–50s)
     - `MAX_ORDERS_PER_RUN` (ex.: 50–150, ajustável)
   - Loop:
     - buscar um lote do cache usando cursor (`created_at_meli` + `order_id`) para continuar de onde parou
     - para cada pedido: chamar API de mensagens e upsert
     - parar quando atingir tempo/quantidade
   - A cada lote, atualizar `sync_state` com heartbeat e cursor
   - Resposta:
     - `{ success:true, status:"paused" | "done", has_more, processed_in_run, total_processed, ... }`

3) **Tratar rate limit / bloqueio (429/403) com backoff e pausa**
   - Se 429: pausar a execução, salvar status `paused_rate_limit`, instruir o frontend a aguardar alguns segundos e continuar.
   - Se 403: salvar status `error` com mensagem clara (pode indicar restrição de permissão/WAF), e evitar ficar tentando em loop.

4) **Bloquear concorrência para não gastar créditos**
   - Se `sync_state.status === "running"` e `last_heartbeat_at` recente, retornar imediatamente:
     - `{ success:true, status:"running", message:"Sincronização já em andamento" }`
   - Isso evita o usuário clicar várias vezes e disparar várias execuções simultâneas.

5) **Cooldown anti-spam**
   - Se `last_success_at` foi há menos de X segundos e `force_full_sync=false`, retornar sucesso sem rodar tudo de novo.

---

### Fase C — Ajustes no Frontend para reduzir erro “genérico” e tentativas desnecessárias
1) **Trocar `supabase.functions.invoke` direto pelo wrapper padrão do projeto**
   - Usar `invokeEdgeFunction()` de `src/lib/edgeFunctionClient.ts` no `useSyncPostSaleMessages`.
   - Benefício: mensagens mais claras, melhor parsing e padronização de erro.

2) **UI de progresso e “Continuar sincronização”**
   - Quando o backend responder `status: "paused"`, frontend pode:
     - continuar automaticamente (com delay) até `done`, ou
     - mostrar botão “Continuar”
   - Mostrar progresso:
     - “Processados X pedidos, sincronizadas Y conversas…”

3) **Selecionar conta ML quando houver mais de uma**
   - Na aba Conversas, incluir um seletor de conta (dropdown).
   - Persistir a última escolhida (localStorage) para não voltar ao “primeiro item da lista”.
   - Isso evita sincronizar seller errado e achar que “não veio mensagem”.

---

## Como vamos validar (teste end-to-end)
1) Testar o sync com uma conta que tenha pedidos no cache:
   - confirmar que não há mais erro de coluna inexistente
2) Confirmar criação de conversas e mensagens nas tabelas:
   - conversas ordenadas por `last_message_date`
   - mensagens exibidas no chat
3) Enviar uma resposta e confirmar:
   - API do ML aceita
   - mensagem aparece no histórico local
4) Simular volume maior:
   - verificar se o estado “paused/done” funciona sem timeout e sem flood de requisições
5) Verificar UX:
   - erros aparecem legíveis (não só “non-2xx status code”)
   - botão de sync não permite spam/conflitos

---

## Entregáveis (o que será alterado)
- Backend function `ml-sync-messages`:
  - corrigir select do cache
  - inferir buyer_id
  - (opcional) enriquecer item via `meli_order_items_cache`
  - passar a retornar 200 com `success:false` em erros operacionais
  - adicionar modo resumível + tabela de estado (Fase B)

- Frontend:
  - atualizar `useSyncPostSaleMessages` para `invokeEdgeFunction`
  - adicionar seletor de conta na tela
  - adicionar fluxo de progresso/continuar sincronização

---

## Priorização sugerida (para parar o prejuízo de créditos rapidamente)
1) **Fase A (hotfix)**: corrigir colunas e inferir buyer_id (para parar 500 agora).
2) **Fase C (mensagem de erro decente + seletor de conta)**: evita tentativas inúteis.
3) **Fase B (resumable sync + rate limit handling)**: garante estabilidade em contas grandes e reduz risco de bloqueio/timeouts.
