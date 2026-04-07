
Diagnóstico confirmado

- O dashboard admin não está “sem dados”; ele está falhando ao carregar e o frontend mascara a falha como zero.
- A causa raiz está no backend function `public.get_admin_dashboard_stats()`: ele referencia `public.mp_webhook_logs`, mas essa tabela não existe no banco atual.
- Evidência direta: a chamada do `/admin` para `get_admin_dashboard_stats` retorna erro `42P01: relation "public.mp_webhook_logs" does not exist`.
- Os dados reais existem:
  - usuários cadastrados: 111
  - registros em `user_access_state`: 110
  - trials ativos: 105
  - assinaturas ativas: 2
- O acesso admin não é o problema: seu usuário está com role `admin`.
- Há um segundo defeito estrutural: `useWebhookLogs()` está como stub/mock, chama a RPC errada e sempre retorna `[]`, então a parte de webhooks também nunca ficaria correta mesmo após o ajuste principal.

Plano de correção definitiva

1. Corrigir a fonte do dashboard no backend
- Recriar `public.get_admin_dashboard_stats()` para usar apenas tabelas reais do modelo atual.
- Substituir `public.mp_webhook_logs` por `public.webhook_events` no cálculo de webhooks pendentes.
- Manter as contagens principais com base no estado atual do sistema:
  - `total_users` via `auth.users`
  - `trial_users` via `public.user_access_state`
  - `active_subscriptions` via `public.user_access_state`/modelo atual
  - `expired_subscriptions` via `public.user_access_state`
- Ajustar `trials_expiring_soon` para 7 dias, alinhando com a regra já definida para avisos.

2. Corrigir a seção de webhooks do admin
- Criar uma RPC administrativa própria, por exemplo `get_admin_webhook_logs(p_limit)`, com `SECURITY DEFINER`, lendo `public.webhook_events`.
- Mapear os campos para o formato esperado no frontend:
  - `topic`/`provider` -> `event_type`
  - `payload_raw` -> `payload`
  - `last_error` -> `error_message`
  - `processed_at` e `created_at`/`received_at`
- Atualizar `useWebhookLogs()` para usar essa RPC real e remover o stub atual que retorna array vazio.

3. Parar de esconder erro como se fosse zero
- Ajustar `useAdminDashboardStats()` para validar a resposta da RPC.
- Se vier erro de permissão ou erro estrutural, propagar isso corretamente.
- Ajustar `AdminDashboard.tsx` para exibir estado de erro claro (“Falha ao carregar métricas do painel”) em vez de renderizar `0` em todos os cards quando `stats` estiver indefinido.

4. Alinhar textos do painel com a regra real
- Atualizar a copy de “Testes Expirando” de “próximos 3 dias” para “próximos 7 dias”.
- Garantir consistência entre card principal, bloco de alerta e cálculo do backend.

5. Validação final
- Validar com usuário admin real no `/admin`:
  - Total de usuários > 0
  - Em teste > 0
  - Assinaturas ativas > 0
  - Webhooks refletindo `webhook_events`
- Validar cenário de erro proposital: se a RPC falhar, o painel deve mostrar mensagem de erro e nunca mais zeros falsos.
- Validar que usuários não-admin continuam bloqueados do painel.

Detalhes técnicos

- Arquivos envolvidos no frontend:
  - `src/hooks/useAdmin.ts`
  - `src/pages/admin/AdminDashboard.tsx`
  - possivelmente `src/types/admin.ts` se houver ajuste de shape
- Mudanças de banco:
  - migration para recriar `public.get_admin_dashboard_stats()`
  - migration para criar `public.get_admin_webhook_logs(...)`
- Ponto exato que hoje quebra:
  - `get_admin_dashboard_stats` usa `public.mp_webhook_logs`
  - a tabela existente no projeto é `public.webhook_events`
- Ponto exato que hoje mascara o problema:
  - `AdminDashboard.tsx` usa fallback `stats?.campo || 0`
  - `useWebhookLogs()` está mockado e não consulta dados reais

Resultado esperado

- O `/admin` volta a mostrar os números reais imediatamente.
- O painel deixa de “zerar silenciosamente” quando houver erro.
- A área de webhooks passa a refletir dados reais do banco.
- O problema fica resolvido de forma estrutural, não apenas “maquiado”.
