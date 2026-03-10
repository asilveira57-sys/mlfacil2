
Diagnóstico confirmado (o que quebrou)
- A lentidão de ~4 minutos e o resultado inconsistente vêm de uma quebra estrutural no pipeline de sync de etiquetas.
- Evidência de produção: logs da função de pedidos mostram erro recorrente ao criar job:
  - "Could not find the 'job_type' column of 'sync_jobs'".
- Causa raiz:
  1) O schema atual de `sync_jobs` foi migrado para (`tenant_id`, `module`, `scope`, status `queued/running/success/failed/canceled`, `metadata`).
  2) As funções `ml-sync-orders`, `ml-sync-shipments` e `ml-sync-invoices` ainda usam schema antigo (`job_type`, `user_id`, `seller_id`, `processed_records`, `completed_at`, status `processing/done/error`).
  3) O hook `useShippingLabels` espera status `success/failed` e depende de polling do job; como o job não é criado, ele fica aguardando timeout por fase (multiplica o tempo total) e segue com dados parcialmente desatualizados.

Plano de correção (hotfix prioritário)
1) Corrigir criação/atualização de job nas 3 funções de sync
- Arquivos:  
  - `supabase/functions/ml-sync-orders/index.ts`  
  - `supabase/functions/ml-sync-shipments/index.ts`  
  - `supabase/functions/ml-sync-invoices/index.ts`
- Ajustes:
  - Inserir em `sync_jobs` no formato novo (`tenant_id`, `module`, `scope`, `status`, `metadata`).
  - Atualizar progresso dentro de `metadata` (ex.: `processed_records`, `total_records`).
  - Finalizar com `success`/`failed` (não `done`/`error`).

2) Tornar o frontend tolerante a ambos formatos durante transição
- Arquivo: `src/hooks/useShippingLabels.ts`
- Ajustes:
  - `waitForJob` aceitar estados:  
    - sucesso: `success` ou `done`  
    - falha: `failed`, `error`, `canceled`
  - Se `job_id` não existir na tabela após poucas tentativas, abortar espera longa (fail-fast) e continuar com fallback de refetch controlado.

3) Corrigir consistência do fluxo de sync manual
- Arquivo: `src/hooks/useShippingLabels.ts`
- Ajustes:
  - Só avançar de fase quando a anterior realmente concluir.
  - Refetch + invalidate após cada fase crítica (orders/shipments/invoices) com checkpoints.

4) Ajuste de rastreabilidade (para não regredir)
- Padronizar `module/scope` dos jobs de etiquetas (ex.: `shipping_labels_orders`, `shipping_labels_shipments`, `shipping_labels_invoices`).
- Garantir metadados mínimos para debug: contadores, `seller_id`, duração, erro.

Validação pós-correção (critério de pronto)
- Executar sync manual em `/shipping-labels` e confirmar:
  - tempo total cai de ~4 min para janela compatível com volume real;
  - jobs aparecem em `sync_jobs` com status válido;
  - progressão visual não trava por timeout artificial;
  - contagens e status finais batem com `get_shipping_orders`.
- Conferir logs recentes das 3 funções sem erro de coluna inexistente.

Detalhes técnicos (resumo)
- Problema principal não é apenas performance: é incompatibilidade entre contrato de job (frontend + edge) e schema real da tabela.
- Corrigir primeiro o contrato de job resolve simultaneamente: tempo, previsibilidade e confiabilidade do resultado.
