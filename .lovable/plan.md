

# Unificar Linha do Tempo com base de dados do Módulo de Custos

## Análise

A Linha do Tempo (`ad_timeline_stats`) já faz JOIN com `meli_listings_cache` — a mesma tabela usada pelo módulo de custos. Não há tabela separada a ser eliminada; a questão é apenas que o SELECT atual não puxa `sku`, `variation_id` e o título é exibido de forma inadequada (mostra MLB ao invés do título completo).

A tabela `meli_listings_cache` já contém todos os campos necessários: `title`, `sku`, `variation_id`, `thumbnail`.

## Alterações

### 1. Hook `useAdTimeline.ts` — Expandir SELECT do listing
- Linha 80: adicionar `sku, variation_id` ao SELECT do `meli_listings_cache`
- Atualizar o tipo `AdTimelineStats` em `src/types/ad-timeline.ts` para incluir `sku?: string` e `variation_id?: string`

### 2. Página `AdTimelineRadar.tsx` — Redesign da coluna "Anúncio"
- Substituir a exibição atual (MLB ID como título principal) por:
  - **Linha 1**: Título completo do produto (truncado em ~60 chars)
  - **Linha 2**: SKU + variação (texto menor, muted)
- A thumbnail (40x40) já está na coluna "Imagem" — mantém
- Atualizar o filtro de busca para também pesquisar por `sku`

### 3. Tipo `AdTimelineStats` — Adicionar campos
- `sku?: string`
- `variation_id?: string`

### Arquivos
- `src/types/ad-timeline.ts`
- `src/hooks/useAdTimeline.ts`
- `src/pages/AdTimelineRadar.tsx`

Nenhuma tabela antiga a ser removida — a unificação já existe via `meli_listings_cache`. A mudança é puramente de apresentação e ampliação dos campos selecionados.

