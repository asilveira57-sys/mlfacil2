
Objetivo: corrigir definitivamente a comissão zerada (com frete preenchido) para ADX Loja e demais contas, com lógica híbrida pré/pós mudança de 03/03/2026.

1) Diagnóstico confirmado (causa raiz)
- Hoje o cálculo real depende principalmente de:
  - `payments[].marketplace_fee` (em `/orders/{id}`) e
  - `meli_billing_details_cache` + busca por período.
- Para pedidos recentes, vários casos ficam sem comissão porque:
  - o parser atual não usa de forma robusta o `/orders/{id}/billing_info` no fluxo principal de cálculo;
  - a sincronização de `meli_billing_details_cache` está defasada em contas afetadas (ex.: ADX com último fetch antigo para período atual);
  - há erro de robustez na Strategy 3 (`Body already consumed`) interrompendo tentativas de busca.
- Evidência no banco: há volume relevante de pedidos pagos pós-04/03 com `fee_ml=0` e alguns com `shipping_cost_seller>0`.

2) Implementação definitiva (híbrida por data + resiliente)
Fase A — Motor híbrido de comissão (regra oficial)
- Criar classificador único de cobranças (fonte única) em `_shared` e reutilizar em:
  - `ml-sync-real-costs`
  - `ml-sync-billing-details`
  - `costs-nightly-sync`
- Regra híbrida:
  - Até 03/03/2026: manter leitura “legado” (marketplace_fee + tipos antigos).
  - A partir de 04/03/2026: priorizar `/orders/{id}/billing_info` com parser multi-campo (não só `type`; também `name/label/description/detail`).
- Mapear categorias por dicionário de aliases PT/ES/EN (ex.: “tarifa de venda total”, “custo de gestão”, “sale_fee”, etc.) e manter fallback para tipos antigos.
- Salvar origem detalhada em `source_refs` (ex.: `billing_info:v2`, `billing_period_details`, `orders:marketplace_fee`) para auditoria.

Fase B — Sincronização de billing sem lacuna
- Ajustar `ml-sync-billing-details` para sempre priorizar o período corrente de forma determinística (mais recente primeiro), evitando “done” com cobertura parcial.
- Garantir atualização recorrente do período atual mesmo com estado anterior “done”.
- Evitar marcação enganosa de conclusão quando não houve atualização efetiva de dados recentes.

Fase C — Correções de estabilidade no real-costs
- Corrigir fluxo que gera `Body already consumed` na Strategy 3.
- Melhorar busca por período para contas de alto volume (paginação e limites), sem interromper processamento no primeiro erro recuperável.
- Remover falsa conclusão de “billing ok” quando só frete veio; manter estado explícito de comissão pendente quando aplicável.

Fase D — Backfill controlado pós-correção
- Reprocessar pedidos impactados (pagos, pós-04/03/2026, `fee_ml=0`) para ADX Loja e conta principal.
- Executar em lotes para não estourar limites da API.
- Preservar política de integridade financeira já existente (nunca sobrescrever comissão válida não-zero com zero).

3) Arquivos/áreas a alterar
- `supabase/functions/ml-sync-real-costs/index.ts`
- `supabase/functions/ml-sync-billing-details/index.ts`
- `supabase/functions/costs-nightly-sync/index.ts`
- Novo helper compartilhado (ex.: `supabase/functions/_shared/ml-billing-classifier.ts`)

4) Critérios de aceite
- Pedido de teste do ADX (exibido no print) deve sair de comissão zero para valor compatível com ML.
- Para pós-04/03/2026:
  - redução clara dos casos `fee_ml=0` em pedidos pagos;
  - sem regressão em pedidos até 03/03/2026.
- Logs sem erro `Body already consumed`.
- `source_refs` deve mostrar origem real usada no cálculo (transparência de auditoria).
- Comparação lado a lado com ML para amostra de pedidos (ADX + conta principal) validando comissão/frete.
