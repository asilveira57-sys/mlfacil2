# Plano — Modo Econômico MKTP Fácil

Objetivo: reduzir drasticamente consumo de banco/API/tokens mantendo apenas Etiquetas de Envio e Etiqueta Full operacionais.

## 1. Infraestrutura de elegibilidade (base de tudo)

**Migração SQL** (`supabase--migration`):
- Adicionar em `workspace_accounts` (ou tabela equivalente do seller): `last_login_at`, `last_active_at`, `auto_sync_paused boolean default false`, `auto_sync_paused_reason text`, `auto_sync_reactivated_at` — só se ainda não existirem.
- Criar tabela `public.system_sync_logs` com campos do prompt (id, tenant_id, seller_id, user_id, module_name, action, status, reason, started_at, finished_at, duration_ms, records_processed, api_calls_count, tokens_used, metadata jsonb, created_at) + GRANTs + RLS (admin lê tudo, seller lê o próprio) + índices em (seller_id, module_name, created_at desc), (tenant_id, created_at desc), (status, created_at desc).
- Índices auxiliares se faltarem: `last_login_at`, `last_active_at` em workspace_accounts.
- Função SQL `public.can_run_auto_sync(p_seller_id, p_module text) returns jsonb` retornando `{allowed, reason}` aplicando:
  - seller ativo + `auto_sync_paused = false`
  - `last_login_at >= now() - interval '3 days'`
  - timezone America/Sao_Paulo: bloqueia 20:00–06:00; sábado >=15:00 e domingo inteiro até segunda 06:00
  - lista de módulos pausados (radiografia, ads, promotions, seed, abc, custos, frete, ajuste_preco, atacado, ad_timeline) → sempre `false` para auto
  - apenas módulos `shipping_labels` e `shipping_full` permitidos dentro da janela
- Função `public.log_sync_decision(...)` grava em `system_sync_logs` (security definer).

## 2. Edge function compartilhada

`supabase/functions/_shared/sync-eligibility.ts` — wrapper que chama `can_run_auto_sync` via RPC e loga via `log_sync_decision`. Toda edge function de sync passa a importá-lo no início e retornar `{skipped: true, reason}` quando bloqueado.

Aplicar nas edge functions já existentes de:
- `ml-sync-orders` (somente em chamadas com flag `auto=true`; manual continua)
- qualquer função de radiografia/ads/promotions/seed/abc/custos/frete/ajuste/atacado/ad-timeline que rode em background ou cron
- `label-teste-*` se existir → retorno imediato 410 Gone

## 3. Frontend — pausa de auto-sync

- **`src/hooks/usePostLoginPrefetch.ts`**: remover `triggerBackgroundOrderSync` ou condicionar a `can_run_auto_sync` (chamar RPC antes). Manter prefetch de menu/visual identity (não consome ML API).
- **`src/hooks/useOrdersSyncWatchdog.ts`**: marcar todos os triggers automáticos como `auto=true`; antes de disparar, chamar RPC de elegibilidade. `forceSyncOrders` (manual) permanece intocado.
- Watchdogs/polling secundários a desativar (chamar RPC + early-return): `useCostSyncWatchdog`, `useCostDataPolling`, `useAdsDataCache` (background preloads), `useTrendsAutoLoad`, `useTrendsPrefetch`, `useMercadoPrefetch`, `useRadiography` background, `usePromotionSyncLogs` autopoll, etc. Manter botão manual em cada módulo.
- Atualizar `last_login_at`/`last_active_at` no listener `SIGNED_IN` (uma chamada `update workspace_accounts`).

## 4. Label Teste — pausa total

- Remover entrada do menu lateral (procurar em `useDynamicMenu`/`system_modules` — desativar via migração: `update system_modules set is_active=false where key='label_teste'`).
- Em `App.tsx` (rota `/label-teste`) substituir componente por redirect para `/etiquetas` com toast "Módulo pausado para controle de custo".
- Em `src/pages/LabelTeste.tsx`: substituir conteúdo por placeholder "Módulo em pausa econômica" (preservar arquivo antigo como `LabelTeste.paused.tsx` com comentário técnico — código original mantido em git).
- Desabilitar quaisquer edge functions `label-teste-*` retornando 410 + log.

## 5. Módulo Custo — restrição a 30 dias

- Localizar UI de importação (`src/pages/Custos.tsx` + componentes filhos) e remover/ocultar botões "Importar 12 meses"/"Importar 1 ano".
- Hooks/edge functions: forçar `date_from = max(date_from, now - 30d)` no lado servidor (validação em `costs_orders_import` e congêneres).
- Cron de importação anual (se existir em `cron.job`) → `cron.unschedule`.
- Esconder rota/botão mas manter função interna acessível para admin (flag `is_admin`).

## 6. Auditoria de crons & edge functions

- Listar via `select * from cron.job` e desativar todos que tocam módulos pausados (radiografia, ads, promotions, seed, abc, custos auto, frete, etc.). Manter apenas crons essenciais (refresh de token ML, etiquetas).
- Documentar no comentário do cron.

## 7. Estado informativo nos módulos pausados

Componente compartilhado `<EconomyModeBanner moduleName="..." onRefresh={...} />` em:
- AdTimeline, Radiografia, Promoções, ADS, Seed, ABC, Custos (lista), Frete, Ajuste Preço, Atacado
Texto: "Este módulo está em modo econômico. Os dados só serão atualizados quando você clicar em Atualizar."

## 8. Admin — auditoria simples

Nova página `/admin/economy-mode` (link em AdminDashboard) mostrando:
- crons ativos (`select * from cron.job`)
- módulos pausados (constante do front)
- contadores agregados dos últimos 7 dias em `system_sync_logs` por module/status
- últimos 100 logs

## 9. Detalhes técnicos

- Timezone: usar `(now() at time zone 'America/Sao_Paulo')` na função SQL — evita dependência de TZ do client.
- Eligibilidade do front: chamar RPC `can_run_auto_sync` antes de qualquer dispatch automático. Cache de 60s por (seller, module) em memória.
- Manual = qualquer botão "Atualizar" passa `manual: true` e bypassa a função (mas continua logando como `manual_sync`).
- Nunca usar `LIMIT` artificial novo — manter paginação por cursor existente.

## 10. Critérios de validação

- `select * from cron.job` mostra apenas essenciais
- Acessar dashboard fora de horário não chama `ml-sync-orders`
- Botão "Atualizar" em Etiquetas funciona 24/7
- `/label-teste` redireciona
- Custos.tsx não tem mais botão de 12 meses
- `system_sync_logs` recebe entradas a cada decisão

## Ordem de execução

1. Migração SQL (tabelas/funções/índices/desativação system_modules)
2. Hook `useSyncEligibility` + invalidações nos watchdogs do front
3. Label Teste: rota + menu + página placeholder
4. Custos: remover botão 12 meses + clamp servidor
5. Banner Modo Econômico nos módulos pausados
6. Página admin de auditoria
7. Desativar crons supérfluos (via `supabase--insert` em `cron.unschedule`)

Confirmação necessária antes de começar: posso prosseguir com **todo o escopo acima de uma vez**, ou prefere fatiar (ex.: começar só por 1+3+4+desativar crons como "fase 1 emergencial" e fazer o resto depois)?