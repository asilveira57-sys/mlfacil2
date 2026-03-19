
Objetivo: reduzir drasticamente o tempo de “Atualizar billing dos pedidos” e garantir cálculo por período (incluindo regra pós 04/03) com precisão.

1) Diagnóstico confirmado (baseado no código + dados atuais)
- O fluxo de “Atualizar selecionados” ainda processa 1 pedido por vez:
  - `cost-engine` chama `ml-sync-real-costs` (`resync_single`) por pedido.
  - Delay fixo de 800ms entre pedidos.
- Último job real: 10 pedidos levou ~177s (quase 3 min).
- Em `resync_single`, a Strategy 3 (busca linear no período) ainda roda por pedido e gera latência alta.
- Há erro intermitente `Body already consumed` na Strategy 3 (leitura duplicada de response), causando retries/falhas e mais lentidão.
- O cache de billing está defasado para pedidos recentes, forçando fallback lento por API de período.

2) Implementação proposta (foco em velocidade + consistência por período)
- Criar ação nova em `ml-sync-real-costs`: `resync_batch_orders`
  - Entrada: `seller_id`, `order_ids[]`, `user_id`.
  - Fluxo:
    - Busca pedidos selecionados em lote.
    - Agrupa por período (mês do `created_at_meli`, com janela complementar quando necessário).
    - Consulta billing por período 1 vez por período (paginação), filtra somente os `order_ids` alvo.
    - Classifica com `classifyBillingCharge` (comissões/frete/parcelamento/ajustes).
    - Faz upsert em lote no `meli_order_financials_cache` + `order_cost_breakdown_cache`.
- No `cost-engine` (bulk resync):
  - Trocar N chamadas `resync_single` por 1 chamada em lote por chunk.
  - Reduzir espera fixa (800ms) para padrão curto (ex.: 100ms) e manter proteção de rate limit por backoff.
- Manter `resync_single` para uso manual/diagnóstico, mas:
  - Corrigir bug de `Body already consumed`.
  - Adicionar flag `skip_strategy3` quando chamado em contexto batch.
  - Otimizar loop da Strategy 3 para parar assim que encontrar todos alvos.

3) Correção de pipeline para manter dados “quentes”
- Ajustar `ml-sync-billing-details` para aceitar chamada interna segura (backend/cron), sem depender apenas de JWT de usuário final.
- No modo `recent`, sempre atualizar período atual + anterior.
- Remover `sleep` fixo de 12s entre requests e usar apenas backoff quando houver 429.
- Resultado: menos necessidade de fallback lento no “Atualizar selecionados”.

4) Garantia da regra por data (mudança de 04/03)
- Preservar classificação híbrida atual (legado + novo formato).
- Prioridade de fontes no lote:
  1. `billing_info`/detalhes por período compatíveis com data da venda
  2. cache local atualizado
  3. pending controlado (sem zerar comissão indevidamente)
- Evitar sobrescrever valores corretos com zero quando ML ainda não liberou cobrança.

5) Validação e critérios de aceite
- Teste alvo: 10 pedidos selecionados concluir em ~30–45s (vs ~3 min atual).
- Confirmar em pedidos pós 04/03:
  - comissão preenchida corretamente,
  - frete preservado,
  - parcelamento separado.
- Confirmar ausência de erro `Body already consumed` nos logs.
- Confirmar que pedidos sem cobrança disponível ficam `pending` (sem distorcer lucro).

Arquivos foco desta implementação:
- `supabase/functions/ml-sync-real-costs/index.ts`
- `supabase/functions/cost-engine/index.ts`
- `supabase/functions/ml-sync-billing-details/index.ts`
