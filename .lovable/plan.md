
# Sincronizacao Automatica de Perguntas, Mensagens e Notificacoes

## Resumo

Criar uma Edge Function `qa-messages-polling-sync` que roda automaticamente via pg_cron, sincroniza perguntas pendentes e mensagens pos-venda para todas as contas ativas, e cria notificacoes na tabela `app_notifications` com o nome da empresa. O frontend exibira um indicador sutil de auto-sync nos headers dos modulos Q&A e Mensagens Pos-Venda.

---

## Parte 1 - Edge Function `qa-messages-polling-sync`

### Arquivo: `supabase/functions/qa-messages-polling-sync/index.ts` (novo)

**Fluxo principal:**

```text
[pg_cron] --> [qa-messages-polling-sync]
                |
                +--> Validar x-job-key
                +--> Verificar lock no sync_scheduler
                +--> Buscar todas ml_accounts ativas (com company JOIN)
                |
                +--> Para cada conta:
                |      +--> Refresh de token (se expirado)
                |      |
                |      +--> Sincronizar perguntas
                |      |      +--> GET /questions/search?status=UNANSWERED
                |      |      +--> Upsert em qa_questions
                |      |      +--> Se novas perguntas: INSERT app_notifications
                |      |         "Verifique a caixa de perguntas, tem algo a responder na (empresa)"
                |      |
                |      +--> Sincronizar mensagens pos-venda
                |             +--> GET /messages/unread (ultimos 7 dias)
                |             +--> Upsert em post_sale_conversations + messages
                |             +--> Se novas mensagens nao-lidas: INSERT app_notifications
                |                "Opa, chegou mensagem para voce na empresa (empresa)"
                |
                +--> Atualizar sync_scheduler (stats + last_run_at)
```

**Logica de notificacao:**
- Antes de sincronizar, busca os `ml_question_id` existentes para perguntas pendentes e os IDs de mensagens existentes
- Apos upsert, compara: novas perguntas = IDs que nao existiam antes
- Se ha novas perguntas pendentes, cria UMA notificacao por conta (agrupada), nao uma por pergunta
- Para mensagens, cria UMA notificacao por conta se ha novas mensagens nao-lidas do comprador
- A notificacao inclui o nome da empresa (`companies.display_name`) no texto
- Usa `group_key` para deduplicar: `qa_pending_{seller_id}_{date}` e `post_sale_new_{seller_id}_{date}`
- Categoria: `qa_pending` para perguntas, `post_sale_blocked` para mensagens (reutiliza categorias existentes)
- Prioridade: `normal` para mensagens, `high` para perguntas (SLA de 15h)
- `action_url`: `/perguntas` para perguntas, `/mensagens-pos-venda` para mensagens

**Detalhes tecnicos:**
- Usa `SUPABASE_SERVICE_ROLE_KEY` (bypass de RLS para inserir notificacoes em nome do usuario)
- Protegido por `x-job-key` com valor de `CRON_JOB_SECRET` ou fallback `default-cron-secret`
- Lock via `sync_scheduler` com TTL de 10 minutos
- Controle interno de intervalo: verifica `last_run_at` para respeitar 10min (dia) / 30min (noite)
- Rate limiting: 200ms entre chamadas API, 500ms entre contas
- Maximo 50 perguntas UNANSWERED e 20 pedidos (para mensagens) por conta
- Token refresh direto via ML OAuth (mesmo padrao do `orders-hourly-sync`)
- Timeout: para apos 50s

**Busca do nome da empresa:**
- JOIN `ml_accounts.company_id` -> `companies.display_name`
- Se nao ha empresa vinculada, usa `ml_accounts.nickname` como fallback

---

## Parte 2 - Ativar Handlers no Worker de Webhooks

### Arquivo: `supabase/functions/ml-worker-process/index.ts` (editar)

Problema atual: O cron job (jobid 11, a cada 5 minutos) chama o worker sem o header `x-internal-key`, resultando em 401. Mesmo se funcionasse, os handlers `processQuestionEvent` e `processMessageEvent` sao placeholders que apenas logam.

**Alteracoes:**

1. **`processQuestionEvent`**: Implementar busca da pergunta especifica via `GET /questions/{id}`, upsert em `qa_questions`, e criacao de notificacao se a pergunta eh nova e UNANSWERED.

2. **`processMessageEvent`**: Implementar busca do pack de mensagens via resource, upsert em `post_sale_conversations` + `post_sale_conversation_messages`, e criacao de notificacao se ha nova mensagem do comprador.

3. **Funcao auxiliar `createNotification`**: Reutilizavel para criar notificacoes no `app_notifications` com texto incluindo o nome da empresa, buscando via `ml_accounts` -> `companies`.

4. **Corrigir autenticacao do cron**: Atualizar o SQL do cron para incluir `x-internal-key` no header, ou alterar o worker para aceitar o `Authorization` como alternativa.

---

## Parte 3 - Banco de Dados

### Migracao SQL

1. Inserir registro no `sync_scheduler` para o novo job:

```sql
INSERT INTO sync_scheduler (job_name, status)
VALUES ('qa-messages-polling', 'idle')
ON CONFLICT (job_name) DO NOTHING;
```

2. Criar 2 jobs pg_cron:

- **Diurno**: A cada 10 minutos, entre 09:00-01:29 UTC (06:00-22:29 BRT)
- **Noturno**: A cada 30 minutos, entre 01:30-08:59 UTC (22:30-05:59 BRT)

3. Atualizar o cron job existente do `ml-worker-process` para incluir `x-internal-key` no header (corrigindo a autenticacao 401).

---

## Parte 4 - Indicador de Auto-Sync no Frontend

### Arquivo: `src/hooks/useSyncSchedulerStatus.ts` (editar)

Adicionar leitura do job `qa-messages-polling` ao hook existente, expondo:
- `pollingLastRun: Date | null`
- `pollingStatus: string`

### Arquivo: `src/components/qa/QaHeader.tsx` (editar)

Adicionar badge discreto mostrando o tempo desde a ultima sincronizacao automatica:
- "Auto-sync: ha 8 min" (texto pequeno, cor `text-muted-foreground`)
- Indicador verde pulsante se rodou nos ultimos 15 minutos
- Indicador amarelo se mais de 15 minutos sem sync

### Arquivo: `src/components/post-sale/PostSaleHeader.tsx` (editar)

Mesmo indicador de auto-sync, reutilizando o hook `useSyncSchedulerStatus`.

---

## Parte 5 - config.toml

### Arquivo: `supabase/config.toml` (editar)

Adicionar entrada para a nova funcao:
```toml
[functions.qa-messages-polling-sync]
verify_jwt = false
```

---

## Resumo de Arquivos

| Arquivo | Acao |
|---------|------|
| `supabase/functions/qa-messages-polling-sync/index.ts` | **Criar** - Funcao principal de polling |
| `supabase/functions/ml-worker-process/index.ts` | **Editar** - Ativar handlers reais + notificacoes |
| `supabase/config.toml` | **Editar** - Registrar nova funcao |
| Migracao SQL | **Criar** - sync_scheduler + pg_cron jobs |
| `src/hooks/useSyncSchedulerStatus.ts` | **Editar** - Ler novo job |
| `src/components/qa/QaHeader.tsx` | **Editar** - Indicador auto-sync |
| `src/components/post-sale/PostSaleHeader.tsx` | **Editar** - Indicador auto-sync |

---

## Detalhes Tecnicos

### Cronograma de Execucao (BRT)

| Periodo | Horario BRT | Horario UTC | Intervalo |
|---------|-------------|-------------|-----------|
| Diurno | 06:00 - 22:29 | 09:00 - 01:29 | 10 minutos |
| Noturno | 22:30 - 05:59 | 01:30 - 08:59 | 30 minutos |

### Formato das Notificacoes

**Nova pergunta:**
- **Titulo**: "Verifique a caixa de perguntas, tem algo a responder na {empresa}"
- **Body**: "{N} pergunta(s) pendente(s)"
- **Categoria**: `qa_pending`
- **Prioridade**: `high`
- **action_url**: `/perguntas`
- **group_key**: `qa_pending_{seller_id}_{YYYY-MM-DD}` (uma por dia por conta)

**Nova mensagem pos-venda:**
- **Titulo**: "Opa, chegou mensagem para voce na empresa {empresa}"
- **Body**: "{N} mensagem(ns) nao lida(s)"
- **Categoria**: `post_sale_blocked` (reutiliza categoria existente mais proxima)
- **Prioridade**: `normal`
- **action_url**: `/mensagens-pos-venda`
- **group_key**: `post_sale_new_{seller_id}_{YYYY-MM-DD}` (uma por dia por conta)

### Deduplicacao de Notificacoes

- Antes de inserir, verifica se ja existe notificacao com o mesmo `group_key` e `is_dismissed = false`
- Se existir, atualiza o `body` com a contagem atualizada em vez de criar duplicata
- Isso evita inundar o usuario com notificacoes repetidas a cada 10 minutos

### Protecoes

- **Lock com TTL**: Impede execucoes simultaneas via `sync_scheduler`
- **Rate limiting**: 200ms entre chamadas API, 500ms entre contas
- **Timeout**: Para apos 50s para respeitar o limite de Edge Functions
- **Token fallback**: Se refresh falha, marca conta como `attention` e segue para a proxima
- **Sem spam**: Notificacoes agrupadas por `group_key` diario, sem notificacao repetida no mesmo dia
- **Horario reduzido a noite**: 30 minutos em vez de 10

### Correcao do Worker (ml-worker-process)

O cron job existente (jobid 11, a cada 5 minutos) envia requests sem `x-internal-key`, causando 401 no worker. A migracao SQL corrigira isso recriando o cron com o header correto, permitindo que webhooks do ML sejam processados em tempo real (complementando o polling).
