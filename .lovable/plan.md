## Análise — onde está indo seu dinheiro no fim de semana

Levantei todos os cron jobs ativos no banco. Os que **rodam sábado/domingo mesmo sem ninguém usar** e consomem invocações + CPU do Cloud:

| Job | Frequência atual | Roda fim de semana? | Necessário sáb-pm/dom? |
|---|---|---|---|
| `orders-hourly-sync` | a cada hora (24/7) | sim | **não** — webhook já cobre venda nova |
| `shipping-status-sync-optimized` | a cada 15 min, 7h-22h | sim | **não** — ninguém imprime etiqueta |
| `ml-sync-messages-worker` | a cada 15 min, 7h-22h | sim | **não** — ninguém responde |
| `qa-messages-polling-day` | a cada 12 min, 7h-22h | sim | **não** |
| `trends-collect-seller-daytime` | a cada hora :15, 7h-22h | sim | **não** crítico |
| `trends-alerts-engine-daytime` | a cada hora :30, 8h-22h | sim | **não** crítico |
| `trends-collect-public-6h` | a cada 6h | sim | pode reduzir |
| `shipping-labels-sync-incremental` | 30/30min seg-sáb | só até sáb | já OK |
| `radiography-nightly-collection` | 5h diário | sim | manter (roda madrugada, barato e útil) |
| `billing-reconcile-payments-5min` | a cada 5 min (24/7) | sim | **manter** — integridade financeira |
| `ml-webhook-ingest` | sob demanda (push do ML) | sim | **manter** — é o que garante "tempo real" |

**Conta rápida do que dá pra cortar** (janela sáb 13h → seg 5h ≈ 40h):
- Hoje, só os 4 jobs grandes (orders + shipping + messages + qa) disparam **~640 execuções** nessa janela, cada uma percorrendo N contas. É o grosso do seu gasto de fim de semana.
- Estimativa: dá pra cortar **60–75% do consumo de Cloud no sábado/domingo**, o que bate com seus US$ 5/dia → meta de economia de US$ 25–40/mês.

---

## Proposta — "Modo Fim de Semana"

Janela de baixa atividade (horário de Brasília, UTC-3):
- **Sábado 13:00 → Segunda 05:00**

Estratégia em 3 camadas, sem desligar nada que quebre a ferramenta:

### Camada 1 — Pausar jobs não essenciais na janela
Reescrever o `schedule` dos crons abaixo para **não rodar** na janela:

| Job | Schedule novo (UTC) | Efeito |
|---|---|---|
| `orders-hourly-sync` | `30 * * * 1-5` + `30 0-15 * * 6` + `30 8-23 * * 1` | roda seg-sex normal, sáb só até 12h BRT, volta seg 5h BRT |
| `shipping-status-sync-optimized` | `*/15 10-22 * * 1-5` + `*/15 10-15 * * 6` | idem |
| `ml-sync-messages-worker` | `*/15 10-22 * * 1-5` + `*/15 10-15 * * 6` | idem |
| `qa-messages-polling-day` | `*/12 10-22 * * 1-5` + `*/12 10-15 * * 6` | idem |
| `trends-collect-seller-daytime` | `15 10-22 * * 1-5` | desliga sáb/dom inteiro |
| `trends-alerts-engine-daytime` | `30 11-22 * * 1-5` | idem |

**Rede de segurança:** o `ml-webhook-ingest` continua ativo. Se entrar venda/pergunta no fim de semana, o webhook do ML grava normal — só não fazemos *polling* redundante.

### Camada 2 — "Catch-up" na segunda 05h
Adicionar **1 execução única** de cada job pausado às 05:00 BRT de segunda (08:00 UTC), garantindo que qualquer coisa que o webhook tenha perdido seja reconciliada antes do cliente entrar.
- `orders-hourly-sync` com `mode: "weekend_catchup"` e `lookback_hours: 48`.
- `shipping-status-sync` rodando uma varredura ampla.
- `ml-sync-messages` puxando últimas 48h.

Custo: ~3 invocações longas, muito mais barato que 160 invocações curtas no fim de semana.

### Camada 3 — Botão de override manual
Adicionar uma flag no painel admin (`weekend_mode_enabled`, default ON) para você desligar a economia manualmente caso precise rodar algo no domingo. Sem deploy, sem migração extra.

---

## O que NÃO mexer (intencional)

- `billing-reconcile-payments-5min` — integridade de pagamento, mantém 24/7.
- `ml-webhook-ingest` — push do ML, custo só quando há evento real.
- `radiography-nightly-collection`, `retrospective-engine-daily`, `seller-periodic-snapshots-daily` — rodam de madrugada (3h–6h), custo baixo, geram relatórios que o cliente vê na segunda.
- `process-email-queue` (5s) — só dispara HTTP **se houver email na fila** (já tem guard SQL). Sem tráfego = sem custo.

---

## Validação que vou fazer depois de aplicar

1. Rodar query no `cron.job` confirmando os 6 schedules novos.
2. Conferir no `queue_execution_log` e logs Postgres que sábado pós-13h tem volume ~zero.
3. Comparar consumo Cloud da próxima semana vs. esta.
4. Se algum cliente reclamar de defasagem na segunda manhã, o catch-up das 5h já cobre.

---

## Detalhes técnicos (resumo)

- Mudanças concentradas em **1 migração SQL** atualizando 6 entradas em `cron.job` via `cron.unschedule` + `cron.schedule` (não posso `UPDATE` direto porque `pg_cron` exige o helper).
- Adição da flag em `system_settings` (tabela já existe) + leitura opcional no início de cada edge function pausável (`if weekend_mode && is_weekend_window) return early`).
- Nenhuma alteração em: geração de etiqueta, ajuste de preço, webhooks, billing, autenticação.

Posso seguir com a implementação assim que você aprovar.
