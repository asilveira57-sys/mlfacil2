

# Plano: Fundação de Banco de Dados do Módulo Radiografia

## Estado Atual

Já existem 4 tabelas do módulo Radiografia:
- `listing_snapshots` — snapshots periódicos com scores e métricas
- `listing_events` — eventos detectados (imutáveis)
- `listing_radiography` — análise profunda sob demanda
- `listing_monitor_config` — configuração por seller

A `meli_listings_cache` existe mas falta: `shipping_mode`, `updated_at`, `last_visit_collection_at`.

## Tabelas a Criar

### 1. `listing_health_history`
Histórico de coletas por item. Uma linha por coleta, nunca sobrescreve.
- Campos: id, seller_id, item_id, collected_at, window_days, visits, price, available_quantity, listing_status, listing_type, shipping_mode, catalog_listing, source, created_at
- Unique constraint: `(seller_id, item_id, collected_at, window_days)` — idempotência
- Índices: `(seller_id, item_id)`, `(seller_id, collected_at DESC)`, `(seller_id, listing_status)`

### 2. `listing_health_current`
Estado atual de cada item (upsert, leitura rápida para a UI).
- Campos: id, seller_id, item_id, last_collected_at, visits_last, price, available_quantity, listing_status, listing_type, shipping_mode, catalog_listing, updated_at
- Unique constraint: `(seller_id, item_id)`
- Índices: `(seller_id)`, `(seller_id, listing_status)`
- Trigger `updated_at`

### 3. `radiography_backfill_control`
Controle de carga histórica por seller com retomada.
- Campos: id, seller_id, status (enum: pending/running/paused/done/failed), progress_percent, last_processed_item_id, current_window_start, current_window_end, started_at, finished_at, updated_at, error_message
- Unique constraint: `(seller_id)` — um backfill ativo por seller
- Trigger `updated_at`

### 4. `radiography_collection_logs`
Logs de todas as execuções do módulo.
- Campos: id, seller_id, job_type (sync/collection/backfill), total_items, items_processed, items_failed, duration_ms, started_at, finished_at, status, error_message, metadata_json, created_at
- Índices: `(seller_id, created_at DESC)`, `(job_type, status)`

## Ajustes em `meli_listings_cache`
Adicionar 3 colunas faltantes:
- `shipping_mode TEXT`
- `updated_at TIMESTAMPTZ DEFAULT now()`
- `last_visit_collection_at TIMESTAMPTZ`

Adicionar índice: `(seller_id, status)`
Trigger `updated_at` na tabela.

## Segurança (RLS)
Todas as 4 novas tabelas:
- RLS habilitado
- Policy SELECT para usuários via `ml_accounts` (mesmo padrão das tabelas existentes)
- Policy ALL para service role

## Resumo da Migration

Uma única migration SQL com:
- 4 novas tabelas com constraints
- ~10 índices
- 3 colunas adicionais em `meli_listings_cache`
- RLS + policies em todas as novas tabelas
- Triggers `updated_at` onde aplicável

## Arquivo Modificado
- Nova migration SQL (via ferramenta de migração)

