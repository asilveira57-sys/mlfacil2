## Diagnóstico

Os dois pedidos existem em `meli_orders_cache` (pack_ids `2000013130005017` e `2000013128814913`, sincronizados hoje), mas **não existe NENHUM registro** em `meli_shipments_cache` para o seller TODOVINOBR (538218315). Sem o cache de shipments, a UI marca todas as vendas como "Sincronizando…" e nada aparece em "Para imprimir" / "Envios de hoje".

Causa raiz: os jobs de sincronização de envios estão **travados** em `sync_scheduler`:

| job_name | status | last_run_at |
|---|---|---|
| shipping-status-sync | running (travado) | 23/05 21:15 |
| shipping-labels-sync | running (sem next_run) | 25/05 16:56 (disparo manual) |
| orders-hourly-sync | running com lock até 17:45 | 25/05 09:32 |

Como `status='running'` e `lock_expires_at` ainda vigente, o próximo tick do cron pula a execução ("já está rodando"), e o cache de shipments nunca é populado. Por isso o cliente atualiza e nada muda.

Adicionalmente, o job `shipping-labels-sync` foi criado hoje sem `next_run_at` nem entrada em `cron.job`, então **não há agendamento recorrente** — só roda quando disparado manualmente.

## Plano de Correção

### Passo 1 — Destravar os jobs presos (migration)
Resetar para `idle` os três jobs com lock vencido/órfão, limpando `lock_expires_at` e `locked_by`:

```sql
UPDATE public.sync_scheduler
   SET status='idle', lock_expires_at=NULL, locked_by=NULL, updated_at=now()
 WHERE job_name IN ('shipping-status-sync','shipping-labels-sync','orders-hourly-sync')
   AND (status='running');
```

### Passo 2 — Forçar repopulação imediata do cache do TODOVINOBR
Disparar manualmente `shipping-labels-sync` (modo full, lookback 7 dias) e `shipping-status-sync` filtrando pelo seller 538218315 para popular `meli_shipments_cache` com os shipments `47130984351` e `47130730720`.

### Passo 3 — Endurecer o scheduler para não travar de novo
Em `sync_scheduler`, adotar política de lock com expiração obrigatória:
- toda transição para `running` grava `lock_expires_at = now() + interval '15 min'`;
- o picker do cron considera elegível qualquer job com `status='running' AND lock_expires_at < now()` (steal lock);
- ao final do job (sucesso ou erro), forçar `status='idle'` e limpar lock no `finally`.

Aplicar nas edge functions `shipping-labels-sync`, `shipping-status-sync` e `orders-hourly-sync`.

### Passo 4 — Garantir cron recorrente para etiquetas
Criar entrada em `cron.job` para `shipping-labels-sync` rodar a cada 15 min (via `supabase--insert` com a URL/anon key específicas do projeto, como manda a doc de cron). Setar `next_run_at` inicial em `sync_scheduler`.

### Passo 5 — Watchdog visível
Na UI de SystemStatus (admin), exibir jobs com `status='running' AND last_run_at < now() - interval '30 min'` em vermelho, para detectar travamento sem precisar abrir o banco.

### Passo 6 — Validação
1. Confirmar que `meli_shipments_cache` recebe ≥2 linhas para seller 538218315.
2. Confirmar que os pacotes `2000013130005017` e `2000013128814913` aparecem em "Envios de hoje" e "Para imprimir" no TODOVINOBR.
3. Aguardar 1 ciclo do cron e confirmar `status='idle'` + `last_run_at` recente.

## Detalhes técnicos

- Tabelas tocadas: `public.sync_scheduler` (UPDATE), `cron.job` (INSERT via supabase--insert).
- Edge functions tocadas: `shipping-labels-sync`, `shipping-status-sync`, `orders-hourly-sync` — apenas para envolver execução em `try/finally` com release de lock.
- Não tocar `meli_orders_cache` nem schemas reservados (`auth`, `storage`, etc.).
- Sem alterações de RLS necessárias.
- Política de "sem TOP/LIMIT artificial" preservada.

Posso seguir com Passos 1, 2 e 4 (destravar + repopular + agendar cron) imediatamente, e tratar Passos 3 e 5 (hardening + watchdog) em sequência?
