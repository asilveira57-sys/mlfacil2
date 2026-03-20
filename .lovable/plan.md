

# Plano: Corrigir Radiografia — 2 bugs de raiz

## Diagnóstico

A Radiografia não funciona por **dois bugs**:

### Bug 1: SYNC falha 100% — constraint duplicada
`meli_listings_cache` tem **duas** unique constraints:
- `(seller_id, item_id, variation_id)` — a correta
- `(seller_id, item_id)` — a antiga, sem variation_id

O upsert usa `onConflict: "seller_id,item_id,variation_id"`, mas itens com variações criam múltiplas linhas com o mesmo `(seller_id, item_id)`, violando a constraint antiga. Resultado: **167/167 falham** no sync.

Logs: `"Upsert error: duplicate key value violates unique constraint meli_listings_cache_seller_item_unique"`

### Bug 2: COLLECTION e BACKFILL falham 100% — URL errada da API
O código chama:
```
GET /items/visits?ids=...
```
A URL correta da API do Mercado Livre é:
```
GET /visits/items?ids=...
```
Resultado: todas as chamadas retornam **400**, zero visitas coletadas.

Logs: `"Visits multiget failed: 400"`

## Correções

### 1. Remover constraint antiga (migration)
```sql
ALTER TABLE meli_listings_cache
DROP CONSTRAINT meli_listings_cache_seller_item_unique;
```

### 2. Corrigir URL da API de visitas
**Arquivo:** `supabase/functions/radiography-collector/index.ts`

Substituir todas as ocorrencias de:
`/items/visits?ids=` → `/visits/items?ids=`

(3 ocorrencias: linhas ~326, ~334, ~561)

## Resultado esperado
- SYNC passa a funcionar: itens populam `meli_listings_cache` corretamente
- COLLECTION e BACKFILL passam a funcionar: visitas são coletadas da API
- `listing_health_history` e `listing_health_current` são populadas
- Prontuário exibe os anúncios com dados reais

## Arquivos modificados
- Migration SQL: drop constraint antiga
- `supabase/functions/radiography-collector/index.ts`: corrigir URL da API

