
# Correção do Pipeline de E-mails

## Contexto

Existem dois sistemas de e-mail rodando em paralelo:
- **Legado** (`email-enqueue-event` → `email_queue` → dispatcher morto) — parado desde 08/abr, com 25 e-mails travados em `queued`.
- **Novo** (`send-transactional-email` → `enqueue_email` → pgmq → `process-email-queue` cron) — funcionando, mas só 54 envios em 30 dias.

O caso `franciscodesouza1@hotmail.com` é sintoma: a conta foi criada antes da migração, e todos os eventos caíram no pipeline antigo congelado.

---

## Fase A — Parar o sangramento (imediato)

1. **Drenar os 25 e-mails travados em `email_queue`**
   - Para cada item com `status='queued'`, mapear o template legado (`marketplace_connected_success`, etc.) para o template equivalente no novo sistema.
   - Reenfileirar via `enqueue_email()` → fila `transactional_emails`.
   - Marcar a linha original em `email_queue` como `migrated` (status novo) para preservar histórico sem reprocessar.

2. **Disparo manual para o Francisco (hotmail)**
   - Invocar `send-transactional-email` com template equivalente a `marketplace_connected_success` (ou welcome) para `franciscodesouza1@hotmail.com`.
   - Usar `idempotencyKey` do tipo `recovery-marketplace-connected-<user_id>` para evitar duplicidade.

3. **Validação**
   - Verificar `email_send_log` (deduplicado por `message_id`) confirmando status `sent` para os 25 + Francisco.

---

## Fase B — Eliminar o pipeline legado (estrutural)

4. **Auditoria de chamadas ao pipeline antigo**
   - Buscar no código todas as referências a `email-enqueue-event`, `email_queue` (INSERT direto), `enqueueEmailEvent` (confirmar se grava em pgmq ou em `email_queue`).
   - Listar edge functions afetadas (ex.: `support-notify`, regras de evento, gatilhos de marketplace conectado).

5. **Migração 1-a-1 dos templates**
   - Para cada chave em `email_event_rules` ainda apontando ao legado, criar template React Email correspondente em `_shared/transactional-email-templates/` e registrar no `registry.ts`.
   - Reapontar o gatilho para `supabase.functions.invoke('send-transactional-email', ...)` com `templateName` correto.

6. **Depreciar `email_queue` / `email_logs`**
   - Remover INSERTs do código.
   - Manter as tabelas como read-only para histórico (não dropar).
   - Adicionar comentário SQL `COMMENT ON TABLE ... IS 'DEPRECATED - read-only history'`.

---

## Fase C — Monitoramento (preventivo)

7. **Alerta no painel admin (`/admin/emails` → aba "Falhas")**
   - Card destacando mensagens em `email_send_log` com `status='pending'` há mais de 1h.
   - Card destacando crescimento da DLQ em pgmq (`transactional_emails_dlq`, `auth_emails_dlq`).

8. **Verificação automática do cron**
   - Health check que consulta `cron.job` por `process-email-queue` e marca como crítico se ausente.
   - Exibir status no painel admin.

---

## Detalhes técnicos

```text
Antes:
  evento → email-enqueue-event → INSERT email_queue (queued)
                                       ↓
                              [dispatcher morto] ✗

Depois:
  evento → send-transactional-email → enqueue_email() → pgmq
                                            ↓
                              process-email-queue (cron 5s) ✓
                                            ↓
                                    email_send_log
```

**Templates legados a migrar:**
- `marketplace_connected_success` (25 ocorrências travadas)
- Demais chaves em `email_event_rules` ainda usando pipeline antigo (a ser listado na Fase B passo 4)

---

## Ordem de execução

Fase A → Fase B → Fase C, sequencialmente. Fase A pode rodar imediatamente após aprovação; B e C iniciam após A validada.
