
# Modo Economia Operacional — Plano de Implementação

## 1. Desativar cron jobs comerciais (banco)

Migração SQL via `cron.unschedule(...)` para remover todos os jobs pg_cron de pull comercial:

- `ml-sync-orders` (vendas/pedidos)
- `post-sale-messages-sync` (mensagens)
- `ml-questions-sync` (perguntas)
- `notifications-commercial-sync` (notificações comerciais)
- `dashboard-aggregate-*` (dashboards comerciais)
- Qualquer outro cron de pull a Mercado Livre

**Mantidos rodando:**
- `webhook-ingest` (recebe eventos do ML)
- `webhook-processor` em modo **lazy** (só processa eventos de sellers ativos — ver seção 3)
- Renovação de token, segurança, backup, monitoramento de erros

Antes de remover, listo via `SELECT jobname FROM cron.job` para confirmar o conjunto exato e gero o `unschedule` correspondente.

## 2. Tabela de sessão ativa por seller

Nova tabela `public.seller_active_sessions`:

| campo | uso |
|---|---|
| `seller_id` (PK) | conta ML |
| `user_id` | usuário dono |
| `last_seen_at` | timestamp do último heartbeat |
| `is_active` | derivado: `last_seen_at > now() - 30min` |

Atualizada por:
- Heartbeat client a cada 60s enquanto há atividade (mouse/keyboard/scroll)
- Login → marca ativo
- Logout → marca inativo imediatamente

Função `public.is_seller_session_active(seller_id)` usada pelo processador de webhook.

## 3. Webhook processor: processamento lazy

Alterações em `supabase/functions/webhook-processor/index.ts`:

- Para cada evento em `webhook_events` (status=pending):
  - Se `is_seller_session_active(seller_id) = true` → processa normalmente
  - Senão → **deixa pendente** (apenas dedup/registro), incrementa contador
- Quando usuário loga, edge function `process-seller-pending-webhooks` é chamada com o `seller_id` para drenar a fila daquele seller

Resultado: webhooks nunca são perdidos, mas só consomem recursos quando há usuário ativo.

## 4. Cliente — gerenciamento de sessão ativa

Novo hook `useActiveSessionTracker` (carregado em `App.tsx`):

- Escuta eventos `mousemove`, `keydown`, `scroll`, `click` (throttled a 30s)
- Mantém `lastActivityAt` em ref
- Heartbeat a cada 60s → upsert em `seller_active_sessions` (apenas se ativo nos últimos 30min)
- Após 30min sem interação → para heartbeats, dispara evento `session:idle`
- Nova interação após idle → retoma heartbeats, dispara `session:resumed`

## 5. Desligar watchdogs/polling no client

Auditar e neutralizar (respeitando idle/session):

- `useOrdersSyncWatchdog` → só roda se sessão ativa + rota visível
- `useCostSyncWatchdog` → idem
- `usePostLoginPrefetch` → mantém (executa só no login, é o disparador inicial)
- Polling em `useAppNotifications`, `usePostSalePendingMessages`, `usePromotions`, `useTrendsAutoLoad`, etc. → todos pausam quando `session:idle`
- Mínimo 5 minutos entre auto-sincs do mesmo módulo

Padrão: cada hook de polling consulta `useIsSessionActive()` e suspende `refetchInterval` quando falso.

## 6. Login: sincronização inicial

Em `usePostLoginPrefetch`:

- Mantém prefetch já existente
- Adiciona chamada à edge function `process-seller-pending-webhooks` para drenar fila acumulada do seller
- Dispara sync incremental: vendas recentes, mensagens pendentes, perguntas pendentes

## 7. Logout: kill switch

Em `useAuth` (signOut):

- Marca `seller_active_sessions.is_active = false` para o seller
- Cancela todos os `queryClient` em vôo
- Limpa intervals/timeouts registrados
- Sinaliza edge functions para abortar jobs do seller (via flag em `sync_jobs`)

## 8. Botão "Atualizar Agora" no header global

Novo componente `RefreshNowButton` no header principal:

- Visível em todas as rotas autenticadas
- Onclick → dispara sync completo do módulo ativo (detectado via `useActiveModuleKey`):
  - Dashboard → recalcula KPIs
  - Vendas → ml-sync-orders incremental
  - Mensagens → post-sale-messages-sync
  - Perguntas → ml-questions-sync
- Mostra spinner enquanto sincroniza, toast no fim
- Throttle: 1 clique a cada 30s

## 9. Validação

- `SELECT jobname FROM cron.job` antes/depois para confirmar crons removidos
- Verificar logs de `webhook-processor` mostrando "skipped: seller inactive"
- Confirmar `seller_active_sessions` recebendo heartbeats no client
- Smoke test: logout → nenhuma chamada a edge function comercial em 5min

## Detalhes técnicos

**Arquivos a criar:**
- `src/hooks/useActiveSessionTracker.ts`
- `src/hooks/useIsSessionActive.ts`
- `src/components/header/RefreshNowButton.tsx`
- `supabase/functions/process-seller-pending-webhooks/index.ts`

**Arquivos a editar:**
- `src/App.tsx` (montar tracker)
- `src/hooks/usePostLoginPrefetch.ts` (drenar webhooks pendentes)
- `src/hooks/useOrdersSyncWatchdog.ts` + demais watchdogs (gate de sessão)
- `supabase/functions/webhook-processor/index.ts` (lazy mode)
- Header component (adicionar botão)

**Migrações:**
1. Criar `seller_active_sessions` + função `is_seller_session_active`
2. Unschedule dos crons comerciais

**Sem rollback granular** — aplicado direto para todos, conforme decidido.
