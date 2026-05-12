## Situação atual

Banco voltou a responder. Mapeamento das tabelas que estão consumindo o disco:

| Tabela | Tamanho | Linhas | Antigas | Observação |
|---|---|---|---|---|
| `cron.job_run_details` | **3.082 MB** | 892k | 853k > 7 dias | log interno do agendador (pg_cron) |
| `webhook_events` | **2.277 MB** | 2.86M | 637k > 30 dias / 2.66M > 7 dias | eventos do Mercado Livre já processados |
| `meli_print_queue_v2` | **632 MB** | 575 | 482 > 7 dias | guarda PDFs/ZPL em base64 |
| `meli_order_items_cache` | 235 MB | 155k | 22k > 30 dias (last_sync) | itens das vendas |
| `shipping_cutoff_logs` | **190 MB** | 0 vivas | bloat puro | tabela vazia mas inflada |
| `meli_billing_details_cache` | **123 MB** | 0 vivas | bloat puro | reimportável |
| `meli_orders_cache` | 116 MB | 154k | 60k vendas > 90 dias | vendas |
| `execution_logs` | 33 MB | 91k | 6k > 30 dias | logs internos |
| `meli_shipments_cache` | 33 MB | 48k | 1.3k > 90 dias | envios |

Ganho estimado total: **~5,5 a 6 GB liberados**. Sua ideia inicial era apagar vendas > 30 dias, mas o gargalo real está em **logs do agendador + webhooks antigos + fila de impressão**, que são 100% reconstituíveis e dão muito mais espaço sem mexer em vendas.

## Plano de limpeza (em ordem de menor risco → maior ganho)

### Fase 1 — Limpeza segura imediata (ganho ~5,4 GB)
1. **`cron.job_run_details`**: apagar registros com `start_time < now() - 7 days`
   - Log puro do pg_cron, não afeta nada operacional. Ganho ~2,9 GB.
2. **`webhook_events`**: apagar registros com `received_at < now() - 7 days` **E** `processed_at IS NOT NULL` (já processados)
   - Mantém a fila pendente intacta. Ganho ~2,1 GB.
3. **`meli_print_queue_v2`**: apagar jobs com `created_at < now() - 7 days` e `status` final (`done`/`error`)
   - Etiquetas antigas; usuário pode reimprimir gerando novo job. Ganho ~500 MB.
4. **`shipping_cutoff_logs` + `meli_billing_details_cache`**: ambas com 0 linhas vivas e ~310 MB de bloat. Rodar `VACUUM FULL` nelas (rápido porque estão vazias).

### Fase 2 — Limpeza de cache de vendas/envios (opcional, ganho ~150 MB)
5. **`meli_orders_cache`**: apagar vendas com `created_at_meli < now() - 90 days` (60k linhas) — dados reimportáveis via sincronização do Mercado Livre.
6. **`meli_order_items_cache`**: cascateia automaticamente os itens das vendas removidas.
7. **`meli_shipments_cache`**: apagar envios com `last_sync_at < now() - 90 days`.
8. **`execution_logs` / `sync_jobs`**: apagar entradas > 30 dias.

> Mantém os últimos 90 dias de vendas no banco (relatórios, retrospectivas, conciliação financeira continuam funcionando). Vendas mais antigas podem ser ressincronizadas sob demanda.

### Fase 3 — Recuperar espaço para o sistema operacional
9. Após os DELETE, rodar `VACUUM (ANALYZE)` nas tabelas tocadas.
   - **Não** vou rodar `VACUUM FULL` nas tabelas grandes em horário de uso (trava a tabela). Se precisar de retorno físico imediato de espaço para o disco, fazemos isso em outra janela; para o Postgres, o espaço vacuumado já é reutilizado internamente.

### Fase 4 — Validar
10. Conferir tamanho final, login, geração de etiqueta e dashboard.

## Decisão para você antes de eu executar

Confirme se quero seguir:

- **(A) Só Fase 1** — máximo ganho com risco mínimo (~5,4 GB), não toca em nenhuma venda.
- **(B) Fase 1 + Fase 2** — ganho ~5,5 GB e ainda corta vendas > 90 dias (mantém 90 dias visíveis sem ressync).
- **(C) Conservador** — só `cron.job_run_details` + `webhook_events` (≈ 5 GB) e nada mais.

Sugiro **(A)** agora; depois avaliamos se a Fase 2 é necessária.

## Detalhes técnicos

- Todos os DELETE serão feitos em lotes (LIMIT por iteração) para não estourar WAL nem travar a tabela.
- `webhook_events` será filtrado por `processed_at IS NOT NULL` para preservar pendentes.
- `meli_print_queue_v2` será filtrado por status terminal para não apagar job em execução.
- `VACUUM` (sem `FULL`) nas tabelas grandes; `VACUUM FULL` apenas em `shipping_cutoff_logs` e `meli_billing_details_cache` (vazias, milissegundos).
- Sem `ALTER DATABASE`, sem mexer em `auth`/`storage`/`vault`/`realtime`.
