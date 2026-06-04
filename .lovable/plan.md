
## Diagnóstico — Por que o balance está em US$ 35 no dia 4

Vasculhei logs de Edge Functions, cron jobs, tabelas e webhooks. Os custos não vêm de “sync de vendedores desconectados”. Vêm de **três fontes claras**:

### 1. Tempestade de webhooks do Mercado Livre (causa principal)

A função `ml-webhook-ingest` é a campeã absoluta de invocações: grava TODOS os eventos que o ML envia, mesmo de tópicos que o sistema nem processa.

Volume real recebido nos últimos dias:
- 03/06: **~165 mil eventos** em 1 dia
- 02/06: **~145 mil eventos**
- 04/06 (até agora): já passou de 40 mil

Distribuição por tópico (24h):
```
items                26.162 ← processado
shipments            26.159 ← processado
public_candidates    22.264 ← NÃO processado, fica entupindo o DB
items_prices         18.720 ← NÃO processado
public_offers        18.250 ← NÃO processado
orders_v2            17.599 ← processado
payments              8.462 ← NÃO processado
price_suggestion      7.103 ← NÃO processado
stock-locations       6.735 ← NÃO processado
post_purchase         2.497 ← NÃO processado
fbm_stock_operations  1.503 ← NÃO processado
catalog_item_competition_status, user-products-families, flex-handshakes, etc.
```

O `ml-worker-process` só trata `items / orders_v2 / messages / questions / shipments`. Todo o resto é gravado, fica como `pending` e **nunca é processado**.

Resultado: a tabela `webhook_events` hoje tem **2.769.956 linhas pendentes**, ocupando **2.191 MB**. Isso é o que mais infla o banco e o que mais cobra: cada webhook = 1 invocação de edge function + 1 INSERT + storage permanente.

### 2. Cron job rodando a cada 5 segundos

```
process-email-queue   68.920 execuções em 4 dias  (a cada 5s, 24/7)
billing-reconcile     1.152 execuções em 4 dias   (a cada 5min, 24/7)
```

Mesmo sem e-mail na fila, `process-email-queue` é invocado **~17 mil vezes por dia**. Edge function invocation tem custo fixo por chamada.

### 3. Bloat de tabelas históricas

```
webhook_events        2.191 MB
meli_print_queue_v2   1.741 MB   ← sem retenção
cron.job_run_details    908 MB   ← histórico inteiro do cron
shipping_cutoff_logs    173 MB
meli_order_items_cache  200 MB
```

Banco total: **5.894 MB**. Mais da metade é lixo histórico ou webhook não processado.

Importante: o que o usuário já pediu (não sincronizar vendedores inativos, não importar venda > 30 dias, só auto-sync de etiquetas) **já está aplicado** — os crons de orders/labels rodam apenas das 10–19h seg–sáb, e o gate `can_run_auto_sync` bloqueia inativos. A sangria atual NÃO é por aí; é pelos itens acima.

---

## Plano de contenção (3 frentes, ordem de impacto)

### Frente A — Parar de gravar webhooks que ninguém usa (corta ~70% das invocações e ~70% do crescimento do DB)

1. Em `ml-webhook-ingest/index.ts`, criar um **allowlist** de tópicos efetivamente processados: `items, orders_v2, orders, shipments, messages, questions, invoices`. Qualquer outro tópico responde 200 OK ao ML (para ele não retentar) **sem gravar nada** no banco.
2. Manter um contador agregado leve (1 linha por dia/tópico em `webhook_ingest_stats`) só para visibilidade, em vez de gravar 22 mil linhas por dia de `public_candidates`.

### Frente B — Limpar o passivo do `webhook_events` (libera ~2 GB de DB de uma vez)

3. Migration:
   - `DELETE FROM webhook_events WHERE status='pending' AND topic NOT IN (allowlist)` (apaga os 2.7M lixo).
   - Política de retenção: `DELETE FROM webhook_events WHERE processed_at < now() - interval '7 days'`.
   - Agendar essa limpeza diariamente via cron.
   - `VACUUM FULL` ou pelo menos `VACUUM` para devolver espaço.

### Frente C — Cortar cron jobs supérfluos

4. `process-email-queue`: mudar de **5 segundos** para **1 minuto** (ou disparar sob demanda quando uma mensagem é enfileirada). Reduz de 17k para 1.4k invocações/dia.
5. `billing-reconcile-payments-5min`: mudar para **15 min** (ou só rodar em horário comercial). Reduz 67%.
6. `reset-stale-sync-locks`: já roda a cada 10 min, ok.
7. Retenção de `cron.job_run_details`: manter só últimos 7 dias (devolve ~800 MB).
8. Retenção de `meli_print_queue_v2`: manter só registros dos últimos 30 dias ou jobs concluídos > 7 dias (devolve ~1.5 GB).
9. Retenção de `shipping_cutoff_logs`: 30 dias.

### Frente D — Visibilidade

10. Painel admin “Custo Operacional” mostrando: invocações por edge function nas últimas 24h/7d, top 10 tópicos de webhook por volume, tamanho das tabelas. Para o senhor poder enxergar antes de estourar de novo.

---

## Impacto estimado

| Ação | Redução |
|---|---|
| Allowlist de webhooks (A) | −70% invocações de `ml-webhook-ingest`, −70% inserts |
| Limpeza + retenção `webhook_events` (B) | −2.0 GB no DB imediato |
| Reduzir frequência de crons (C4–C5) | −90% invocações de `process-email-queue` |
| Retenção de logs/print queue/cutoff (C7–C9) | −2.5 GB no DB |

Total esperado: **DB cai de ~5.9 GB para ~1.4 GB** e invocações diárias de edge function caem para **menos de 1/4** do atual. Isso volta o consumo de balance para um patamar sustentável sem mexer em nada que o usuário usa de fato.

## Arquivos previstos

- `supabase/functions/ml-webhook-ingest/index.ts` — allowlist de tópicos.
- Nova migration:
  - cleanup de `webhook_events`, `cron.job_run_details`, `meli_print_queue_v2`, `shipping_cutoff_logs`.
  - criação de job cron de retenção diária.
  - ajuste de schedule de `process-email-queue` e `billing-reconcile-payments-5min`.
- (Opcional, frente D) novo painel admin de custo operacional.

Posso seguir com as frentes A + B + C (impacto imediato no balance) e deixar D para depois?
