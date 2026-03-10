

## Problema

A tabela da Linha do Tempo não exibe thumbnail, título, SKU, Status ML nem Estoque. Todos esses campos vêm do enriquecimento via `meli_listings_cache` no hook `useAdTimelineStats` (linhas 70-89). Quando o item não existe nessa tabela, os campos ficam vazios.

## Causa raiz

O enriquecimento usa apenas `meli_listings_cache` como fonte. Se o item não foi sincronizado para essa tabela, todos os campos de listagem ficam nulos. Não há fallback.

## Correções

### 1. Adicionar fallback de enriquecimento em `useAdTimelineStats` (`src/hooks/useAdTimeline.ts`)

Após buscar em `meli_listings_cache`, para itens que não retornaram dados, buscar em `meli_order_items_cache` como fallback (mesmo padrão do `useTrendsItemCache`). Isso cobre título e thumbnail.

### 2. Melhorar layout da coluna "Anúncio" (`src/pages/AdTimelineRadar.tsx`)

- Linha 1: título (truncado) — já existe mas mostra item_id quando título é nulo
- Linha 2: item_id sempre visível + SKU se disponível
- Garantir que o item_id aparece sempre como identificador secundário, mesmo quando há título

### 3. Status ML e Estoque com placeholder melhor

Quando `status` e `available_quantity` são nulos (dados não enriquecidos), exibir "—" de forma consistente (já faz isso). O problema real é que os dados não chegam — o fallback do item 1 resolve parcialmente, mas status e estoque só existem em `meli_listings_cache`. Para esses, manter "—" quando indisponível é o comportamento correto.

### Arquivos alterados
- `src/hooks/useAdTimeline.ts` — fallback de enriquecimento via `meli_order_items_cache`
- `src/pages/AdTimelineRadar.tsx` — ajuste visual da coluna Anúncio (título + item_id + SKU)

