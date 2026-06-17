## Objetivo

Garantir contagem exata de "contas que acessaram o MKTP Fácil por dia", eliminando a dependência atual de `profiles.last_login_at` (sobrescrito) e de `security_events` (subnotificado).

## Problema atual

- `profiles.last_login_at` é sobrescrito a cada login — não é possível recuperar logins anteriores.
- `security_events` só recebe insert via hook `useActiveSessions` com dedup de 24h e em fluxos parciais — subconta.
- `auth_logs` (analytics) retém ~9 minutos.
- `auth.users.last_sign_in_at` só atualiza em emissão de refresh token.

## Solução proposta

### 1. Tabela `login_events` (append-only)
- Colunas: `id`, `user_id`, `created_at`, `ip_address`, `user_agent`, `source` (web/extension/api), `session_fingerprint`.
- Índices: `(user_id, created_at desc)`, `(created_at)`.
- RLS: usuário vê só os seus; service_role e admins leem tudo.
- GRANT INSERT/SELECT para `authenticated`, ALL para `service_role`.

### 2. Gravação automática
- Estender `touch_user_activity(user_id, is_login=true)` (já chamado em `usePostLoginPrefetch` no evento `SIGNED_IN`) para inserir uma linha em `login_events` quando `is_login=true`.
- Continuar mantendo `profiles.last_login_at` para compatibilidade com a UI atual.

### 3. View materializada `login_daily_counts`
- `dia` (BRT), `contas_unicas`, `total_eventos`.
- Refresh automático via cron diário 00:05 BRT, dentro do gate central (sem custo extra fora da janela).

### 4. Painel admin
- Em `CostReportPanel.tsx` (ou novo card no AdminDashboard): gráfico de contas/dia últimos 30 dias + tabela com top 10 contas mais ativas.

### 5. Backfill mínimo
- Popular `login_events` retroativamente com os 2 registros existentes em `security_events` (apenas para não perder histórico mínimo).

## Itens fora do escopo (não tocar)
- Autenticação (Supabase Auth).
- Geração de etiquetas, impressão, integrações ML, RLS de tabelas existentes.

## Kill-switch
- Feature flag `login_tracking_enabled` em `dynamic_feature_flags`. Se off, `touch_user_activity` pula o insert em `login_events`.

## Entregáveis
1. Migration: cria `login_events`, índices, RLS, GRANT, e atualiza função `touch_user_activity`.
2. Migration: view `login_daily_counts` + cron de refresh.
3. UI: card em CostReportPanel com gráfico de logins/dia.

A partir de amanhã passamos a ter número **exato** de contas que acessam por dia.