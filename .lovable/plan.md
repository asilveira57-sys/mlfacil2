## Diagnóstico

Os 2 pedidos da TODOVINOBR (47188577752 e 47180746215) estão no nosso cache com `shipment_substatus = invoice_pending` e `last_sync_at = 02/06 09:07 BRT`. O cache só é atualizado quando:

1. O usuário clica em **Atualizar** na tela de Etiquetas, ou
2. O cron `shipping-status-sync` roda a cada 15 min e revalida os envios ativos via API do ML.

O caminho (1) funciona. O caminho (2) **está quebrado desde 25/05/2026**.

### Causa raiz

A função `shipping-status-sync` (e a `shipping-labels-sync`) tem um guard `isAuthorized()` que aceita:
- `x-cron-key` igual a `CRON_JOB_SECRET`, **ou**
- `Authorization: Bearer <SUPABASE_ANON_KEY>`

Os jobs do pg_cron enviam apenas o `Authorization: Bearer <anon-key>`. A variável `SUPABASE_ANON_KEY` dentro do runtime do edge function **não bate** (provavelmente vazia ou diferente do que o cron envia), então a função retorna **401 Unauthorized imediatamente**, antes de qualquer `console.log`.

Evidências:
- `sync_scheduler.shipping-status-sync` → `status = running`, `last_run_at = 2026-05-25 17:55` (preso há 8 dias).
- Logs da edge function hoje: só `booted` e `shutdown`, nenhum log interno (= return cedo no auth).
- Cron jobs 46/47/48 invocam a função normalmente a cada 15 min, mas todas as chamadas falham silenciosamente.

Consequência: nenhuma revalidação automática de status de envio para nenhum vendedor há mais de uma semana. O usuário só vê a atualização quando clica Atualizar manualmente.

## Correção

### 1. Aceitar a service role key como autorização válida nas 2 funções
Em `supabase/functions/shipping-status-sync/index.ts` e `supabase/functions/shipping-labels-sync/index.ts`, no `isAuthorized()`:
- Manter `x-cron-key === CRON_JOB_SECRET`.
- Manter `Bearer SUPABASE_ANON_KEY`.
- **Adicionar** aceitação de `Bearer SUPABASE_SERVICE_ROLE_KEY`.
- **Adicionar** logs de diagnóstico quando rejeitar 401 (cabeçalhos presentes, comprimento do token, sem expor o segredo) para evitar futura cegueira.

### 2. Migrar os jobs do pg_cron para usar `x-cron-key`
Trocar os 5 cron jobs (`shipping-labels-sync-morning`, `shipping-labels-sync-incremental`, `shipping-status-sync-mon`, `shipping-status-sync-tue-fri`, `shipping-status-sync-sat`) para enviar o cabeçalho `x-cron-key` com o valor de `CRON_JOB_SECRET` (lendo do `vault` via `cron.schedule`). Isso elimina a dependência do anon key, que muda quando rotacionado.

### 3. Resetar o lock preso
Atualizar `sync_scheduler` zerando o estado de `shipping-status-sync` (`status = 'idle'`) para que o próximo tick rode sem depender do bypass de 10 min.

### 4. Disparar uma execução imediata
Após corrigir, invocar `shipping-status-sync` uma vez para atualizar os 2 pedidos da TODOVINOBR (e todos os demais envios ativos parados) agora, sem esperar o próximo tick.

### Detalhes técnicos

- Arquivos: `supabase/functions/shipping-status-sync/index.ts`, `supabase/functions/shipping-labels-sync/index.ts`.
- Migração: `UPDATE cron.job SET command = ...` para os 5 jobs, e `UPDATE sync_scheduler SET status='idle' WHERE job_name='shipping-status-sync'`.
- Não há mudança de schema, RLS ou GRANTs.
- Não toca em código de UI nem em outros módulos.

## Validação

1. Logs da próxima execução do cron devem mostrar `[shipping-status-sync] Processing N accounts` e `[UPDATE] 47188577752: ready_to_ship/invoice_pending → ready_to_ship/ready_to_print` quando o ML já tiver mudado.
2. `meli_shipments_cache.last_sync_at` dos 2 pedidos deve avançar para horário atual sem o usuário clicar Atualizar.
3. `sync_scheduler.shipping-status-sync.status` deve alternar entre `running` e `idle` a cada tick.