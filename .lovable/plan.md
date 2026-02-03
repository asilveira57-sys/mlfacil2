
## Diagnóstico (com evidência do seu ambiente)

O sistema **não está travado para puxar pedidos**. Os pedidos depois de 27/01 existem no banco e chegam até **03/02** para a conta **66043362 (ADECONEXVV)**.

O que está “travado” é a **tela de Etiquetas de Envio** parecer parada em 27/01 porque ela **só mostra pedidos que já têm o envio (shipment) sincronizado no cache**.

### O que encontrei (fatos objetivos)
- **Pedidos (orders) estão atualizados**: há pedidos em `meli_orders_cache` até **2026-02-03 20:09:06+00**.
- **Envios (shipments) estão incompletos**:
  - `meli_shipments_cache` tem **1332** registros, mas ainda existem **4060** pedidos com `shipment_id` sem registro correspondente no cache.
  - Só nos últimos 30 dias, faltam **309** envios para a conta (isso explica por que não aparece nada recente na lista).
- Na sua tela (imagem), o “Todos 953” bate com um sintoma clássico: **consulta limitada a ~1000 linhas** no backend + ausência de paginação/ordenação adequada no fluxo que coleta `shipment_ids`.

## Causa raiz (por que parou exatamente em 27/01)

Existem **dois bugs de arquitetura** no `useShippingLabels.ts` que juntos produzem exatamente esse “congelamento”:

1) **Limite padrão de 1000 linhas nas consultas**
   - No pipeline de sync, após disparar `ml-sync-orders`, o código faz:
     - `select('order_id, shipment_id')` em `meli_orders_cache` **sem paginação** e **sem order**.
   - Em ambientes com muitos pedidos, isso retorna só o “primeiro bloco” (geralmente ~1000 linhas), que tende a ficar preso em uma faixa antiga (no seu caso, ~27/01).
   - Resultado: o app **nem chega a pedir** os shipments mais novos para sincronizar.

2) **O pipeline de etiquetas não espera o job de pedidos terminar**
   - O código dispara `ml-sync-orders` e só dá um `sleep(1500)` antes de buscar shipment_ids.
   - Isso faz o pipeline coletar shipment_ids **antes** dos pedidos recentes terminarem de cair no cache, reforçando o “travamento” na mesma data.

Concluindo: o sync “não deu erro” porque de fato ele conclui jobs, mas ele **trabalha sempre no subconjunto errado** (primeiras ~1000 linhas/antigas) e não completa o backfill dos envios recentes.

---

## Solução definitiva (para parar o desperdício de crédito)

### Objetivo
Garantir que a tela de Etiquetas:
1) **Nunca mais pareça “travada” em uma data antiga**
2) Sempre sincronize **envios recentes** de forma previsível
3) Tenha **diagnóstico visível** (sem tentativa e erro)

### Entregas (em ordem)

#### 1) Corrigir o pipeline de sync das Etiquetas (frontend)
Alterar `startSyncPipeline` para:

1. **Esperar o job de pedidos finalizar** (se `ml-sync-orders` retornar `job_id`)
   - Poll em `sync_jobs` até `done`/`error` (timeout razoável).
   - Só então seguir para shipments/invoices.

2. **Buscar pedidos “certos” para sincronizar shipments**
   - Em vez de `select('order_id, shipment_id')` sem ordem:
     - aplicar `order('created_at_meli', { ascending: false })`
     - aplicar filtro de período (no mínimo “últimos 30 dias” quando período = Todos, ou o período selecionado)
     - **paginar** usando `.range()` em blocos (ex.: 0-999, 1000-1999...) até cobrir o período/limite de segurança.

3. **Calcular missing shipments corretamente (sem corte de 500)**
   - Hoje existe `allShipmentIds.slice(0, 500)` que distorce a detecção.
   - Trocar por verificação em batches (ex.: 200 por vez) acumulando `existingSet`.

4. **Sincronizar shipments em lotes com controle de ritmo**
   - Manter batches (ex.: 200 ids por invoke) + pequenos delays.
   - Mostrar progresso real em `syncProgress` (ex.: “Sincronizando envios 2/6”).

5. **Invoices também em batches**
   - `ml-sync-invoices` deve receber `order_ids` em lotes (para não explodir payload/tempo).

Resultado esperado: em 1 clique o sistema sincroniza os ~309 shipments faltantes dos últimos 30 dias e a lista deixa de parar em 27/01.

#### 2) Parar de “esconder” pedidos quando shipment ainda não existe (UX anti-travamento)
Hoje a tabela faz:
- “se não tem shipment no cache, não mostra a linha”.

Vou alterar para:
- mostrar pedidos recentes mesmo sem shipment (com estado “Sincronizando envio…” / “Envio pendente de cache”),
- e um botão contextual “Sincronizar envios deste período”.

Isso evita a sensação de travamento e reduz prompts repetidos.

#### 3) Corrigir a contagem “Todos 953” para não depender de consulta truncada
O bloco `shipping-orders-all` hoje também consulta grande volume sem paginação e faz `.in('shipment_id', shipmentIds)` sem batching.
Ajuste:
- counts baseados no **mesmo universo paginado** (período selecionado), com batching.
- Se o período “Todos” for muito grande, aplicar uma regra clara:
  - “Todos (últimos 30 dias)” por padrão para performance,
  - e o usuário usa o filtro de período/custom para expandir com intenção.

#### 4) Automação no backend para não depender do navegador (opcional, mas recomendado para “definitivo”)
Hoje você automatizou pedidos (nightly/hourly), mas **shipments e invoices ainda dependem muito do frontend**.
Proposta:
- Criar jobs automáticos:
  - `shipments-hourly-sync` (últimas 48h)
  - `shipments-nightly-sync` (últimos 30 dias)
  - (opcional) `invoices-hourly-sync` / `invoices-nightly-sync`
- Eles rodam com lock no `sync_scheduler`, refresh de token, batching e rate-limit.
- A tela de Etiquetas vira somente “leitura + ações”, não o motor de sincronização.

Isso evita o cenário de “tentei 4 vezes e nada muda”.

#### 5) Painel de diagnóstico (para acabar com tentativa e erro)
Adicionar no topo das Etiquetas:
- “Último pedido no cache: DD/MM HH:mm”
- “Shipments faltantes (30d): X”
- “Última execução de envios: há Y min”
- Botão “Reparar envios (30 dias)”

Assim, quando algo falhar, fica óbvio o que falta (orders vs shipments vs invoices).

---

## Critérios de aceite (sem subjetividade)
1) Na tela `/shipping-labels`, com período “Todos”:
   - aparece pedido com data **> 27/01** (ex.: 03/02).
2) `missing_30d` (shipments faltantes nos últimos 30 dias) cai de ~309 para **próximo de 0** após um sync.
3) O botão de sync não “conclui” antes de o job de pedidos terminar (pipeline sequencial e rastreável).
4) Mesmo que shipments ainda não estejam no cache, os pedidos recentes **aparecem** com status de “pendente” (sem sensação de travamento).

---

## Riscos e como vamos evitar
- **Timeout / payload grande**: resolvido com paginação + batches.
- **Rate limit da API**: resolvido com delays e batches pequenos (já há padrão no projeto).
- **Dados históricos enormes**: por padrão trabalharemos em “recente” (30d/48h) e só expande com filtro custom.

---

## Plano de execução (passo a passo)
1) Ajustar `useShippingLabels.ts`:
   - esperar `ml-sync-orders` concluir
   - coletar `shipment_ids` via query ordenada + paginada
   - detectar missing shipments via batches
   - invocar `ml-sync-shipments` em batches
   - invocar `ml-sync-invoices` em batches
   - preencher `syncProgress` e estados para feedback
2) Alterar a renderização da tabela para **não ocultar** pedidos sem shipment cache (mostrar placeholder)
3) Refatorar `shipping-orders-all` (counts) para:
   - usar universo paginado/batch
   - evitar `.in(...)` gigante sem batching
4) (Recomendado) Criar jobs automáticos para shipments/invoices com lock no `sync_scheduler` (sem depender do navegador)
5) Teste E2E:
   - abrir Etiquetas, rodar sync 1 vez, verificar datas > 27/01 e missing_30d ~ 0

Se você aprovar, eu implemento em uma rodada só e já deixo a tela com diagnóstico para você não precisar “gastar crédito no escuro” de novo.
