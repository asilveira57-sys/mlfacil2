
# Plano: Tornar o Módulo Linha do Tempo Funcional

## Diagnóstico

Após análise do código, identifiquei as seguintes correções necessárias:

| Problema | Causa | Solução |
|----------|-------|---------|
| Média Gap em horas | Função `formatGap()` exibe em horas | Converter para dias (ex: "5.6d") |
| Sem paginação | Tabela mostra todos os registros | Implementar paginação com 30 itens por página |
| Sem filtros de ordenação | Cabeçalhos da tabela são estáticos | Adicionar ordenação clicável em cada coluna |
| Limite de 1000 registros | `useAdTimelineStats` usa `.limit(500)` | Usar função `fetchAllRows` com paginação |
| Status do anúncio | Campo `status` buscado mas não exibido | Adicionar coluna com badge de status (ativo/pausado/inativo) |

---

## Alterações Necessárias

### 1. Hook `useAdTimeline.ts`
**Arquivo:** `src/hooks/useAdTimeline.ts`

Modificações:
- Remover `.limit(500)` de `useAdTimelineStats`
- Usar função `fetchAllRows` para buscar todos os registros
- Remover `.limit(200)` de `useAdLifecycleActions`
- Adicionar campo `available_quantity` na busca de listings

### 2. Página `AdTimelineRadar.tsx`
**Arquivo:** `src/pages/AdTimelineRadar.tsx`

Modificações:
- Adicionar estado de paginação (página atual, itens por página = 30)
- Adicionar controles de paginação (anterior/próximo, seletor de página)
- Modificar função `formatGap()` para converter horas em dias
- Adicionar estado de ordenação (coluna, direção)
- Tornar cabeçalhos da tabela clicáveis para ordenação
- Adicionar coluna "Status ML" com badge colorido
- Adicionar coluna "Estoque"

### 3. Tipos
**Arquivo:** `src/types/ad-timeline.ts`

Modificações:
- Adicionar campo `available_quantity?: number` ao tipo `AdTimelineStats`

---

## Detalhes Técnicos

### Paginação (30 itens por página)

```text
Estado:
- currentPage: number (default: 1)
- itemsPerPage: number (default: 30)

Lógica:
- startIndex = (currentPage - 1) * itemsPerPage
- endIndex = startIndex + itemsPerPage
- paginatedItems = filteredStats.slice(startIndex, endIndex)
- totalPages = Math.ceil(filteredStats.length / itemsPerPage)

UI:
- Botões "Anterior" / "Próximo"
- Indicador "Página X de Y"
- Contador "Mostrando X-Y de Z anúncios"
```

### Formatação da Média Gap (Horas → Dias)

```text
Antes: formatGap(1139.5) → "1140h"
Depois: formatGap(1139.5) → "47.5d"

Função:
- Se hours < 24: exibir em horas ("12h")
- Se hours >= 24: exibir em dias ("X.Xd")
```

### Ordenação da Tabela

```text
Estado:
- sortColumn: string | null
- sortDirection: 'asc' | 'desc'

Colunas ordenáveis:
- Última Venda (last_sale_at)
- Dias s/ Venda (days_since_last_sale)
- Média Gap (avg_gap_hours)
- 30d, 60d, 90d (sales_count_*)
- Status ML (status)
- Estoque (available_quantity)

UI:
- Ícone de seta no cabeçalho clicável
- Destaque visual na coluna ativa
```

### Coluna de Status ML

```text
Mapeamento:
- "active" → Badge verde "Ativo"
- "paused" → Badge amarelo "Pausado"
- "under_review" → Badge azul "Em análise"
- "closed" → Badge vermelho "Fechado"
- null/undefined → Badge cinza "—"

Campo estoque:
- available_quantity → exibir número
- Se 0 → Badge vermelho "Sem estoque"
```

### Remoção de Limites

```text
Antes:
  query.limit(500) // useAdTimelineStats
  query.limit(200) // useAdLifecycleActions

Depois:
  Usar fetchAllRows() com paginação automática
  Processar todos os registros no cliente
  Paginar apenas na UI
```

---

## Arquivos a Modificar

| Arquivo | Tipo |
|---------|------|
| `src/types/ad-timeline.ts` | Adicionar campos |
| `src/hooks/useAdTimeline.ts` | Remover limites, buscar mais campos |
| `src/pages/AdTimelineRadar.tsx` | Paginação, ordenação, status |

---

## Resultado Esperado

Após as alterações:
1. **780 anúncios** disponíveis na tabela (sem limite de 500)
2. Média Gap exibida em **dias** (ex: "47.5d" ao invés de "1140h")
3. **30 anúncios por página** com navegação clara
4. **Ordenação** em qualquer coluna clicando no cabeçalho
5. **Status do ML** visível (Ativo/Pausado/Em análise)
6. **Estoque** disponível como coluna adicional

## Impacto

- **Baixo risco**: Alterações apenas no frontend
- **Sem alteração de schema**: Dados já existem no cache
- **Performance**: Paginação no cliente é eficiente até ~10.000 registros
