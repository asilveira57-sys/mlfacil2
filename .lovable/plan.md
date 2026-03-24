
Diagnóstico (com evidência)
1) O pedido informado `2000012046908069` não existe no cache local atual.  
2) Pelo contexto da tela (buyer `CHARBON_WEAR`, 15/03), o pedido correspondente no cache é `2000015560022610` (shipment `46658814350`).  
3) Esse shipment está **stale**: `shipment_status=pending`, `shipment_substatus=buffered`, `last_sync_at=2026-03-16`, então o sistema mantém `final_status='outros'` e ele não entra em “Etiquetas para imprimir”.  
4) Causa-raiz: há dois filtros que “congelam” envios antigos:
   - `shipping-status-sync` só revalida ativos com `last_sync_at` dos últimos 7 dias.
   - `useShippingLabels` (fase 4.5) revalida apenas `ready_to_ship/handling`, excluindo `pending`.

Plano de correção (definitivo)
1) Corrigir revalidação de ativos no backend (`shipping-status-sync`)
- Remover a trava de 7 dias em `last_sync_at`.
- Revalidar ativos por prioridade: `pending` e mais antigos primeiro.
- Manter limite por execução (ex.: 150 por conta) para controle de custo.
- Logar contadores: `active_found`, `rechecked`, `updated`, `api_errors`.

2) Corrigir recheck manual na tela de Envios (`useShippingLabels`)
- Na fase 4.5, incluir `pending` junto com `ready_to_ship`/`handling`.
- Preservar lote e debounce já existentes (sem aumento descontrolado de chamadas).
- Garantir que pedidos antigos com envio ativo também sejam atualizados.

3) Hardening de consistência para “Envios de hoje”
- Manter `today_dispatch` baseado em status logístico ativo.
- Evitar que status stale fique indefinidamente em `outros` por falta de refresh.
- Não mudar regra de negócio de Full (continuar usando `logistic_type` como fonte de verdade).

4) Backfill corretivo imediato (após deploy)
- Rodar uma passada de revalidação para shipments ativos com `last_sync_at` antigo.
- Objetivo: normalizar casos já afetados (incluindo o shipment `46658814350`).

Validação de aceite
1) O shipment `46658814350` deve atualizar de `pending/buffered` para status/substatus real do marketplace.  
2) Com filtros “Envios de hoje” + “Etiquetas para imprimir”, o pedido deve aparecer quando estiver de fato `ready_to_print/printed`.  
3) Pedido com venda >7 dias e envio ativo hoje deve continuar aparecendo corretamente.  
4) Não regressão: enviados/delivered continuam fora da fila operacional.

Arquivos impactados
- `supabase/functions/shipping-status-sync/index.ts`
- `src/hooks/useShippingLabels.ts`
- (se necessário para observabilidade) logs em `sync_jobs`/`system_logs` nos pontos de recheck.
