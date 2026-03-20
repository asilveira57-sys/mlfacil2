
# Plano: Módulo Radiografia — Backend Completo

## Status: PROMPT 2 CONCLUÍDO ✅

## O que foi implementado

### PROMPT 1 — Banco de Dados ✅
- 4 novas tabelas: `listing_health_history`, `listing_health_current`, `radiography_backfill_control`, `radiography_collection_logs`
- 3 colunas adicionais em `meli_listings_cache` (shipping_mode, updated_at, last_visit_collection_at)
- ~10 índices, constraints de unicidade, triggers updated_at
- RLS + policies em todas as tabelas
- Coluna `anomaly_flags` em `listing_health_current`

### PROMPT 2 — Backend, Jobs e Coleta ✅
**Edge Function:** `supabase/functions/radiography-collector/index.ts`

#### Fluxo 1 — Sync de Anúncios (action: "sync")
- Busca todos os itens ativos via API ML com paginação
- Multiget de detalhes em lotes de 20
- Upsert em `meli_listings_cache`
- Atualiza `last_sync_at`
- Logs completos

#### Fluxo 2 — Coleta Noturna (action: "collection")
- Seleciona itens com `last_visit_collection_at` nulo ou >= 4 dias
- Multiget de visitas em lotes de 50
- Insere em `listing_health_history`
- Atualiza `listing_health_current` por upsert
- Atualiza `last_visit_collection_at`
- Retry em rate limit
- Detecção de anomalias ao final

#### Fluxo 3 — Backfill Histórico (action: "backfill")
- 5 janelas: 0-30, 31-60, 61-90, 91-120, 121-150 dias
- Checkpoint e retomada via `radiography_backfill_control`
- Self-chain para evitar timeout (50s safety)
- Status: pending → running → paused → done/failed

#### Fluxo 4 — Atualização Current
- Integrado nos fluxos 2 e 3 (upsert em `listing_health_current`)

#### Fluxo 5 — Detecção de Anomalias
- `zero_visits` — item ativo sem visitas
- `high_stock_low_traction` — estoque alto sem tração
- `visit_drop` — queda >40% de visitas
- `consistent_decline` — declínio em 3 períodos consecutivos
- Flags persistidos em `listing_health_current.anomaly_flags`

#### Cron Job
- `radiography-nightly-collection`: roda a cada 4 dias às 05:00 UTC (02:00 BRT)
- Chama action "nightly" que processa todos os sellers ativos

#### Action "full"
- Pipeline completo para um seller: sync → collection → backfill (async)

## Arquivos Criados/Modificados
- `supabase/functions/radiography-collector/index.ts` — NOVO
- Migrations para tabelas, índices, RLS
- Cron job configurado via pg_cron
