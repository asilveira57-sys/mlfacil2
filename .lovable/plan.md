

# Correção Completa: E-mails de Autenticação Não Chegando

## Diagnóstico Confirmado

Existem **dois sistemas de e-mail paralelos** no projeto, e ambos estão com problemas:

### Sistema 1: Lovable Cloud (auth-email-hook → process-email-queue)
- Domínio `notify.notifica.mktpfacil.com` verificado e ativo
- Fila pgmq configurada e rodando a cada 5 segundos
- **Últimos 8 e-mails (30/03 a 02/04) foram enviados com sucesso** via este sistema
- **Desde 02/04 (6 dias), ZERO novos e-mails** no `email_send_log`
- Sem logs da edge function `auth-email-hook` nos analytics — isso indica que o hook **não está sendo chamado** pelo backend de autenticação, possivelmente porque não foi re-deployed após as últimas alterações no código

### Sistema 2: Legado (email-worker-send → Resend API)
- Roda via cron a cada 5 minutos (7h-20h)
- **Retornando 401 constantemente** nos logs — o cron usa `anon_key` + `x-internal-key: SERVICE_ROLE_KEY_PLACEHOLDER` (literal), então a autenticação falha
- **2 e-mails parados** na `email_queue` com status `queued` desde 31/03 e 02/04, nunca enviados
- O provedor Resend (`email_provider_settings`) tem o domínio `mktpfacil.com` que **não é verificado** (último teste em 26/03 deu erro 403 do Resend)

### Bug adicional: CHECK constraint
- O `process-email-queue` tenta inserir `status = 'rate_limited'` na tabela `email_send_log`, mas a constraint só aceita: `pending, sent, suppressed, failed, bounced, complained, dlq`
- Qualquer rate limit do provedor crasharia silenciosamente o processamento da fila

---

## Plano de Correção (5 passos)

### 1. Re-deploy do auth-email-hook
O hook precisa ser re-deployed para garantir que o backend de autenticação esteja roteando e-mails corretamente para ele. Sem isso, os e-mails de signup/recovery simplesmente não são processados.

### 2. Corrigir CHECK constraint do email_send_log
Adicionar `rate_limited` à lista de valores aceitos para evitar crash silencioso:
```sql
ALTER TABLE public.email_send_log DROP CONSTRAINT IF EXISTS email_send_log_status_check;
ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_status_check
  CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq', 'rate_limited'));
```

### 3. Desativar o sistema legado (email-worker-send)
O cron do `email-worker-send` está fazendo requisições inúteis (401) a cada 5 minutos. Precisa ser desativado para não conflitar:
```sql
SELECT cron.unschedule('email-worker-send-every-5min');
```
Os 2 e-mails parados na `email_queue` serão processados manualmente ou marcados como expirados.

### 4. Melhorar UX de cadastro — Fallback para quando o e-mail não chega
- **Aviso no cadastro** (`CriarAcesso.tsx` / `VerifyEmailState`): Adicionar texto orientando a checar spam/promoções e um botão de reenvio mais visível
- **Copiar link manual** (já existe no admin via `admin-resend-verification`): Garantir que está funcionando e visível na lista de clientes

### 5. Monitoramento — Aba de Logs unificada
A aba de Logs do admin (`EmailLogsTab`) consulta apenas `email_logs` (sistema legado). Precisa incluir também dados do `email_send_log` (sistema ativo) para dar visibilidade real ao admin sobre entregas e falhas.

---

## Detalhes Técnicos

**Arquivos afetados:**
- Deploy: `supabase/functions/auth-email-hook/index.ts` (sem alteração de código, apenas re-deploy)
- Migration: Corrigir constraint + desativar cron legado
- Frontend: `src/pages/CriarAcesso.tsx` (melhorar VerifyEmailState com aviso de spam)
- Frontend: `src/components/admin/email/EmailLogsTab.tsx` (incluir dados de `email_send_log`)
- Frontend: `src/hooks/useEmailAdmin.ts` (adicionar query para `email_send_log`)

**Resultado esperado:**
- E-mails de signup/recovery voltam a chegar imediatamente após re-deploy
- Se houver rate limit, o sistema loga corretamente em vez de crashar
- Sistema legado para de gerar erros 401 inúteis
- Usuários que não recebem e-mail veem orientação clara sobre spam
- Admin tem visibilidade completa dos envios no painel

