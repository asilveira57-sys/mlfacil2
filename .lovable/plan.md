

## Análise das 3 questões levantadas

---

### 1. O número 100 ("100 sem taxas") — é limite ou coincidência?

**É coincidência.** Não existe nenhum limite fixo de 100 registros no código.

A query em `getOrdersNoCost` (cost-engine, linha 1174-1187) busca todos os registros da `order_cost_breakdown_cache` com `fee_ml_source IN ('pending', 'no_charges')` no período selecionado, sem `.limit()`. O Supabase aplica limite padrão de 1000, mas nesse caso a paginação é feita no código (página de 50). Os 100 "sem taxas" são simplesmente a contagem real de pedidos que têm `fee_ml_source = 'no_charges'` naquele período de 30 dias.

---

### 2. O sistema já é idempotente e pula o que já foi processado?

**Parcialmente sim, mas com ressalvas:**

- **Backfill (`backfill_missing`)** — Linhas 539-555: verifica quais pedidos já têm breakdown via `existingSet.has(order.order_id)` e **pula** os que já existem. Usa `INSERT` (não upsert) para os novos. **Esse passo é idempotente e eficiente.**

- **Reprocess Pending (`reprocess_pending`)** — Linha 287-293: busca pedidos com `fee_ml_source = 'pending' OR commission_cost = 0` e reprocessa **todos** eles, inclusive os que já foram verificados e continuam pendentes (porque o billing ainda não chegou). Faz upsert, então não duplica, mas **faz chamadas API desnecessárias** para pedidos que sabidamente ainda não têm billing.

- **handleStartOrContinue (incremental)** — Linha 689-691: usa a RPC `count_orders_needing_cost_sync` para contar apenas pedidos que precisam de sync. Se nenhum precisa, marca como `done` imediatamente. **Esse fluxo é eficiente.**

- **calculateCosts (cost-engine)** — Linha 550-557: busca TODOS os pedidos pagos do período e recalcula tudo, fazendo upsert. **Não pula nada — é um recálculo completo.** Porém usa dados já em cache (billing_details_cache), sem chamadas API externas.

**Problema principal para escala (500 sellers):** O `reprocess_pending` (botão "Forçar Sincronização" na aba Sem Custo) faz chamadas à API do ML (`/shipments/{id}/costs`) para cada pedido pendente sem frete. Em escala, isso consome rate limit. O nightly sync (`costs-nightly-sync`) já existe e roda às 02:30 BRT, o que é correto.

**Sua visão está correta.** O sistema deveria:
1. Na primeira carga, processar o histórico completo (já faz via backfill)
2. Nas execuções seguintes, pular pedidos que já têm billing real (`fee_ml_source = 'billing'`)
3. Só reprocessar pendentes no ciclo noturno, não sob demanda do usuário em horário de pico

---

### 3. Passo 2 — comportamento confuso (93 pendentes, 0% a 100%, reinicia)

O que está acontecendo:

1. O **Passo 2** (`ml-sync-real-costs` com `action: "start"`) busca pedidos que precisam de sync
2. Encontra 93 pendentes, mostra progresso 0/93
3. Processa todos — mas como o billing desses 93 pedidos ainda **não existe** no `meli_billing_details_cache`, eles permanecem como `fee_ml_source = 'pending'`
4. Marca como `done` (100%)
5. O watchdog detecta que ainda há pendentes → reinicia automaticamente
6. Loop infinito: processa → todos continuam pendentes → done → reinicia

**O problema real:** esses 93 pedidos são vendas recentes cujo billing o Mercado Livre ainda não disponibilizou (~24h após a venda). O sistema fica em loop tentando resolver algo que não pode ser resolvido naquele momento.

---

### Plano de correção

#### Tarefa 1: Evitar loop infinito no Passo 2
- No `handleStartOrContinue` (incremental mode), ao processar pedidos pendentes e nenhum deles ter recebido billing novo, marcar como `done` e **não reiniciar** automaticamente
- Adicionar campo `last_pending_count` no state; se a contagem de pendentes não mudou entre execuções, parar

#### Tarefa 2: Otimizar `reprocess_pending` para escala
- Adicionar filtro de "cooldown": pedidos pendentes que foram verificados há menos de 12h são pulados
- Adicionar coluna `last_checked_at` na `order_cost_breakdown_cache` para rastrear quando cada pedido foi verificado por último
- Evitar chamadas API para pedidos recentes (< 48h) que sabidamente não terão billing

#### Tarefa 3: Limitar reprocessamento manual em horário de pico
- O botão "Forçar Sincronização" na aba Sem Custo deveria ter um rate limit por seller (máximo 1x a cada 30 min)
- Exibir mensagem clara: "Pedidos recentes podem levar até 24-48h para ter dados de billing"

#### Tarefa 4: Melhorar feedback visual do Passo 2
- Distinguir no progresso: quantos foram **atualizados** vs quantos **permaneceram pendentes**
- Ao finalizar, mostrar mensagem clara: "X pedidos atualizados, Y permanecem pendentes (aguardando billing do ML)"
- Não reiniciar automaticamente se todos os pendentes são de vendas < 48h

