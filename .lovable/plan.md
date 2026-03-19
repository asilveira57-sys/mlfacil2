
Objetivo: corrigir com urgência os 3 fluxos de atualização de billing (lote, individual e reimportação), eliminando sobrescrita com zero, recuperando comissão/frete e reduzindo tempo/custo operacional.

1) Diagnóstico consolidado (confirmado no código + dados)
- Fluxo em lote (marcação à esquerda) está sobrescrevendo `shipping_cost_seller` e `commission_cost` com zero quando não encontra billing no momento.
- Fluxo individual (ícone à direita) é lento por causa da Strategy 3 (busca linear por período) e ainda falha com `Body already consumed`, interrompendo a busca de comissão.
- Fluxo “Excluir e reimportar” apaga caches de billing e recalcula sem refazer sync financeiro antes, resultando em comissão/frete zerados.
- Bug crítico extra: upserts de `meli_shipment_costs_cache` usam `onConflict: "shipment_id"`, mas o índice único é `(seller_id, shipment_id)`. Resultado: cache de frete praticamente não grava.
- Evidência do caso `2000015348755242`: sem registro em `meli_order_financials_cache`, sem billing cache para o pedido, resync individual trouxe só frete via API de shipment, comissão ficou pendente.

2) Correção de integridade (não-destrutiva) no backend de custos
Arquivo: `supabase/functions/ml-sync-real-costs/index.ts`
- Aplicar trava anti-sobrescrita em TODOS os caminhos de escrita (resync_batch_orders, incremental/full, reprocess):  
  - Se novo valor de comissão/frete vier 0 e já existir valor > 0 no breakdown, preservar valor existente.
  - Só permitir overwrite para zero em casos explícitos de “sem taxa real” (ex.: `no_charges`) com evidência de origem.
- Corrigir upsert de frete para `onConflict: "seller_id,shipment_id"` em todos os pontos.
- Em `resync_batch_orders`, incluir fallback de frete via API de shipment quando cache não tiver valor.
- Em `resync_batch_orders`, incluir fallback Strategy 3 otimizada por período (uma busca por período para N pedidos pendentes), evitando busca linear por pedido.

3) Correção de comissão (legado + novo formato)
Arquivo: `supabase/functions/ml-sync-real-costs/index.ts`
- Quando `feeML === 0`, executar `billing_info` (Strategy 1b) independentemente da data, mantendo a lógica de data apenas para prioridade de estratégia.
- Melhorar leitura de campos de cobrança (aliases) para capturar variações de payload e alimentar `classifyBillingCharge`.
- Manter status `pending` quando houver apenas frete sem comissão, sem apagar dados válidos anteriores.

4) Correção de performance do resync individual
Arquivo: `supabase/functions/ml-sync-real-costs/index.ts`
- Corrigir bug `Body already consumed` (ler corpo de response apenas uma vez por resposta).
- Limitar Strategy 3 com:
  - teto de páginas menor e encerramento antecipado ao encontrar pedido(s),
  - backoff só em 429,
  - logs de tempo por estratégia para monitorar gargalos.
- Resultado esperado: atualização individual deixa de travar por minutos.

5) Correção do fluxo “Excluir e reimportar”
Arquivo: `supabase/functions/cost-engine/index.ts`
- Em `reimportOrder` e no job de `job_type='reimport'`, após limpar cache:
  - executar resync financeiro (`ml-sync-real-costs`) antes de `calculateSingleOrder`,
  - usar `resync_batch_orders` em lote para manter velocidade.
- Isso garante que reimportação não volte sem billing.

6) Redução de custo de chamadas recorrentes (subscrição/polling)
Arquivos: `src/hooks/useCostSyncWatchdog.ts`, `src/components/custos/CostSettings.tsx`
- Reduzir polling de status contínuo (atualmente frequente) para modo sob demanda:
  - manter atualização manual por ação do usuário,
  - pausar polling quando não houver job ativo.
- Evita chamadas periódicas caras sem impacto funcional no cálculo.

7) Validação de aceite (obrigatória)
- Caso real: `2000015348755242`
  - lote não pode apagar frete existente,
  - individual não pode falhar com `Body already consumed`,
  - reimportação deve retornar com billing (ou pendência explícita sem destruir histórico).
- Amostra operacional:
  - 10 pedidos em lote com tempo-alvo significativamente menor que o atual,
  - comissão preenchida quando disponível no provedor,
  - frete preservado/recuperado de forma consistente.
- Auditoria:
  - conferir `last_writer`, `fee_ml_source`, e transições de valor (antes/depois) para garantir política financeira não-destrutiva.
