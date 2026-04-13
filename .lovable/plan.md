
Objetivo: descobrir por que o reset de senha agora parece falhar para vários clientes, incluindo `overlordcomerciobrasil@gmail.com`, e corrigir a causa real sem continuar no ciclo de “parece tudo certo”.

Diagnóstico já sustentado pelo código:
- O front continua disparando o reset normalmente em `src/pages/Auth.tsx` via `supabase.auth.resetPasswordForEmail(...)`.
- A rota de recuperação `/reset-password` está pública e não aparenta estar bloqueando o fluxo.
- O domínio de envio `notify.notifica.mktpfacil.com` continua verificado.
- O hook `supabase/functions/auth-email-hook/index.ts` está configurado para:
  - receber eventos de auth,
  - registrar `pending` em `email_send_log`,
  - enfileirar no `auth_emails`.
- O worker `supabase/functions/process-email-queue/index.ts` é quem transforma fila em `sent`, `failed`, `rate_limited` ou `dlq`.
- Já existe um fallback manual com “Gerar Link de Reset” no admin.
- O painel/admin atual pode estar mascarando o estado real:
  - `useEmailSendLog` mostra só as últimas linhas, sem deduplicação;
  - `useEmailAnalyticsSummary` ainda usa tabelas legadas (`email_logs`, `email_queue`) em vez da infraestrutura nova (`email_send_log` / `email_send_state`).

O que isso indica:
- Se o usuário não aparece em `email_send_log`, o reset está morrendo antes do hook.
- Se aparece como `pending` e não avança, o problema é fila/worker.
- Se aparece `failed`, `rate_limited`, `dlq` ou `suppressed`, o problema já está identificado no pipeline.
- Como você relatou que “ninguém está recebendo”, não dá mais para tratar como caso isolado; precisamos validar falha global.

Plano de implementação:
1. Confirmar a falha com dados reais do backend
   - Consultar os registros recentes para `overlordcomerciobrasil@gmail.com` em:
     - `email_send_log`
     - `suppressed_emails`
   - Consultar logs recentes de autenticação para pedidos de recovery.
   - Consultar logs do `auth-email-hook`.
   - Consultar logs do `process-email-queue`.
   - Verificar `email_send_state.retry_after_until` e sinais de backlog/rate limit.

2. Classificar exatamente o ponto da quebra
   - Cenário A: não existe log para o e-mail reportado
     - problema antes do hook;
     - investigar auth/recovery request não chegando ao pipeline.
   - Cenário B: existe `pending`, mas não vira `sent`
     - problema no worker/cron/fila.
   - Cenário C: existe `failed`, `rate_limited`, `dlq` ou `suppressed`
     - problema de entrega/processamento já identificável e corrigível.
   - Cenário D: alguns casos entram e outros não
     - divergência por usuário, dados quebrados ou supressão seletiva.

3. Corrigir a causa raiz conforme o cenário encontrado
   - Se o hook não estiver recebendo recovery:
     - ajustar o fluxo de auth email/reconciliação do hook;
     - redeployar o hook.
   - Se a fila estiver travando:
     - corrigir/revalidar a infraestrutura de envio;
     - normalizar o worker e o estado da fila.
   - Se houver rate limit:
     - ajustar tratamento operacional e visibilidade;
     - evitar falsa impressão de “enviado”.
   - Se houver supressão indevida:
     - localizar a regra/origem e limpar o bloqueio correto.
   - Se houver divergência cadastral entre autenticação e perfil:
     - reparar o cadastro afetado.

4. Corrigir a observabilidade do admin para parar de enganar o suporte
   - Atualizar logs para mostrar o fluxo real da infraestrutura atual:
     - solicitado,
     - pending,
     - sent,
     - failed/rate_limited/dlq/suppressed.
   - Ajustar analytics para parar de depender de tabelas legadas.
   - Deduplicar por `message_id` para não contar o mesmo e-mail múltiplas vezes.
   - Adicionar filtros rápidos por e-mail e tipo `recovery`.

5. Manter fallback operacional robusto
   - Preservar o botão de gerar link manual.
   - Se necessário, melhorar a UX para copiar/reenviar o link mais rápido em suporte.
   - Isso evita bloquear usuário final enquanto a causa raiz é corrigida.

Resultado esperado:
- Fica claro se o problema atual é global ou parcial.
- Descobrimos exatamente onde o reset está morrendo.
- Corrigimos o pipeline real, em vez de continuar apagando incêndio por usuário.
- O painel administrativo passa a refletir o estado verdadeiro dos e-mails.

Detalhes técnicos importantes:
- Arquivos já identificados como centrais:
  - `src/pages/Auth.tsx`
  - `src/pages/ResetPassword.tsx`
  - `supabase/functions/auth-email-hook/index.ts`
  - `supabase/functions/process-email-queue/index.ts`
  - `src/hooks/useEmailSendLog.ts`
  - `src/hooks/useEmailAnalytics.ts`
  - `src/components/admin/email/EmailLogsTab.tsx`
- Há um problema secundário no admin:
  - o resumo analítico ainda consulta `email_logs` e `email_queue` legados;
  - isso pode fazer parecer que “está tudo ok” quando o pipeline atual não está.
- Também vou validar, na execução, se o worker está parando por:
  - `rate_limited`
  - `emails_disabled`
  - falhas repetidas que empurram mensagens para `dlq`.

Ordem de execução quando eu puder implementar:
1. consultar backend real e logs;
2. identificar o ponto exato da quebra;
3. corrigir pipeline/hook/worker;
4. ajustar dashboard/logs;
5. testar recovery de ponta a ponta com e-mail afetado.

<lov-actions>
<lov-suggestion message="Test the password reset flow end-to-end with an affected account and verify whether the email reaches the inbox, spam folder, and email logs correctly.">Verify that it works</lov-suggestion>
<lov-suggestion message="Fix the admin email dashboard to use the current email_send_log pipeline, deduplicate by message_id, and add filters for recovery emails and recipient search.">Corrigir dashboard de e-mails</lov-suggestion>
<lov-suggestion message="Add a full audit trail for password recovery requests showing requested, queued, sent, failed, suppressed, or missing-before-hook states in the admin panel.">Adicionar trilha de auditoria</lov-suggestion>
<lov-suggestion message="Improve the manual reset link fallback in Admin Users with copy history, expiration info, and WhatsApp-friendly share text for support.">Melhorar fallback manual</lov-suggestion>
<lov-suggestion message="Investigate and fix the Mercado Livre label generation issue for accounts that are still receiving A4 labels with separation pages instead of the correct thermal format.">Corrigir etiquetas A4 e separação</lov-suggestion>
</lov-actions>
