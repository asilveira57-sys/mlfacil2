# Fase 1.1 — Estabilização e redução de custo

Plano dividido em 4 entregas pequenas e reversíveis. Nada do que será alterado toca: autenticação, geração de etiquetas (`ml-generate-labels*`), impressão, integrações Mercado Livre (OAuth/webhook ingestion já contida na Fase 1) ou RLS.

Todas as regras novas ficam atrás de **feature flags em `platform_settings`** (kill switch instantâneo, sem deploy).

---

## 1) Janela operacional + fim de semana + inatividade (gate central)

Atualizar a função SQL `public.can_run_auto_sync(user_id, module)` (já existe e já é chamada por todos os watchdogs/preloads via `useSyncEligibility.ts`):

- Fuso: `America/Sao_Paulo` (já está).
- Janela seg–sex: **07:00 ≤ hora < 19:00** (hoje é 07–17).
- Sábado: **07:00 ≤ hora < 12:00**, depois bloqueado (`reason: 'saturday_economy'`).
- Domingo: bloqueado (já está).
- Inatividade ≥ 3 dias sem login: bloqueado (já está).
- Módulos com auto-sync permitido passam a ser: `shipping_labels`, `shipping_full`, `messages`, `qa` (hoje só shipping). Todos os demais continuam bloqueados via `paused_module`.
- Ler flags de `platform_settings`:
  - `economy_mode.enabled` (default true) — se false, libera tudo (kill switch global).
  - `economy_mode.window_start_hour`, `window_end_hour`, `saturday_end_hour` — overrides numéricos.
  - `economy_mode.allowed_modules` — array para alterar whitelist sem deploy.

Como tudo passa pelo gate `canRunAutoSync` no frontend e idealmente também na borda dos crons, mudar a função SQL propaga a regra imediatamente.

## 2) Gate de horário nos crons do Postgres (pg_cron)

Crons que rodam em `pg_cron` não passam pelo gate JS. Criar wrapper SQL `public.cron_gate_allows(p_module text)` que aplica a mesma janela horária + kill switch, e envolver os jobs operacionais existentes (orders-hourly, shipping-status-sync, ml-token-refresh agendados, etc.) num `CASE WHEN public.cron_gate_allows(...) THEN net.http_post(...) END`.

- Excluídos do gate (continuam 24/7): `ml-token-refresh` (renovação de token é segurança), `mercadopago-webhook` (não é cron), limpeza/maintenance noturna.
- Listar antes/depois cada job tocado no relatório final.

## 3) Retenção 24h das etiquetas Full

A Fase 1 já criou `cleanup_print_payloads` (zera `pdf_base64`, `zpl_content`, `batches` em jobs terminais > 24h preservando metadata). Agora:

- Agendar `cleanup_print_payloads` via `pg_cron` 1×/dia às 03:00 BRT.
- Adicionar variante que mantém **somente o último arquivo por seller** em `meli_print_queue_v2` (jobs terminais antigos do mesmo seller têm payload zerado, último preservado por 24h).
- Não tocar em `meli_print_queue` legado nem em colunas de metadata (`shipment_id`, `seller_id`, datas, status, histórico).

## 4) Monitoramento + alertas + dashboard admin

- Nova tabela `public.cost_daily_report` populada por job `cost-daily-report` (edge function nova, idempotente, agendada 1×/dia 06:00 BRT) com: webhooks recebidos/descartados/processados, tamanho de `webhook_events`/`meli_print_queue_v2`/`meli_orders_cache`, sellers ativos, sellers suspensos por inatividade, jobs executados, jobs bloqueados por horário, jobs bloqueados por inatividade, espaço liberado.
- Tabela `public.cost_alerts` + função `raise_cost_alert(kind,severity,payload)` chamada quando:
  - `webhook_events` pendentes > 50.000,
  - crescimento de `webhook_events` > 100.000 em 24h,
  - `meli_print_queue_v2` > 500 MB,
  - cron disparou fora da janela (registrado pelo wrapper),
  - seller suspenso voltou a logar (hook em `touch_user_activity`).
- Página admin `/admin/economia` (já existe `AdminEconomyMode.tsx`) ganha aba "Relatório diário" e "Alertas" lendo essas tabelas. Sem nova rota, sem alterar menu.

## Kill switches (todos em `platform_settings`)

| Flag | Efeito |
|---|---|
| `economy_mode.enabled=false` | Libera 100% (volta ao comportamento antigo) |
| `economy_mode.cron_gate_enabled=false` | Crons voltam a rodar 24/7 |
| `economy_mode.retention_enabled=false` | Para o cleanup de payloads |
| `economy_mode.alerts_enabled=false` | Silencia alertas |

Cada flag é lida em tempo real, sem cache > 60 s.

## Detalhes técnicos

- **Migration 1**: atualiza `can_run_auto_sync` (nova janela + sábado + leitura de flags + nova whitelist) e cria `cron_gate_allows`.
- **Migration 2**: cria `cost_daily_report`, `cost_alerts`, `raise_cost_alert`, agenda `cleanup_print_payloads` e `cost-daily-report` no `pg_cron`.
- **Migration 3 (separada para revisão)**: regrava os cron jobs existentes envolvendo cada `net.http_post` com `cron_gate_allows`. Cada job listado individualmente.
- **Edge function nova**: `cost-daily-report` (apenas SELECTs agregados + INSERT em `cost_daily_report`).
- **Frontend**: aba nova em `AdminEconomyMode.tsx` (leitura apenas). Banner `EconomyModeBanner` ganha texto atualizado para sábado tarde / fora de horário.

## Não-mexer (lista explícita)

- `ml-generate-labels*`, `ml-generate-labels-labeltest*`, `ml-generate-labels-status*`
- `ml-webhook-ingest`, `ml-oauth-callback`, `ml-token-refresh`, `mp-token-refresh`
- `auth-email-hook`, `admin-*`
- Qualquer policy RLS existente
- `src/integrations/supabase/client.ts`

## Validações no fim

- Smoke: gerar etiqueta (LAZERMIX), baixar PDF e ZPL.
- Confirmar `ml_accounts` e `webhook_events` aceitando inserts normais.
- Snapshot do `cost_daily_report` antes/depois (estimativa de economia).
- Lista de crons antes/depois.
- Contagem de sellers suspensos por inatividade.

## Entrega

3 migrations + 1 edge function + 1 aba admin. Total ~600 linhas. Rollback = setar 1 flag.

Aprovar para eu começar pela Migration 1 (gate SQL + flags) — a mais segura e a que já entrega 80% do ganho.
