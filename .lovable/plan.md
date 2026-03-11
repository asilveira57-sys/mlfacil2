

## Plano: Melhorias da Linha do Tempo

Vários ajustes na tela Radar e Detalhe da Linha do Tempo.

---

### 1. Exportar Excel (.xlsx) e PDF (com logomarca)

**Excel**: Gerar arquivo `.xlsx` client-side usando a lib `xlsx` (SheetJS). O botão "Exportar CSV" vira um dropdown com "Excel" e "PDF".

**PDF**: Gerar via `jspdf` (já instalado). Cabeçalho com logomarca do seller (da tabela `companies.logo_url`) ou logo padrão do Marketplace Fácil. Tabela formatada com as colunas visíveis.

**Arquivos**:
- `src/utils/exportTimeline.ts` — funções `exportTimelineExcel()` e `exportTimelinePdf()`
- `src/pages/AdTimelineRadar.tsx` — trocar botão por dropdown com 2 opções
- Instalar `xlsx` (SheetJS)

---

### 2. Remover "Republicar" do menu e da tela de detalhe

- `AdTimelineRadar.tsx` linhas 568-569: remover DropdownMenuItem de "Republicar"
- `AdTimelineDetail.tsx` linha 148: remover botão "Republicar"
- `ActionDrawer.tsx` linhas 36-40: remover configuração RELIST (manter tipo no type mas não exibir no UI)

---

### 3. Criar tarefa ao Encerrar ou Clonar

Ao confirmar ação no `ActionDrawer`, além de criar a `ad_lifecycle_action`, criar automaticamente uma tarefa no módulo de tarefas via `useTasks.createTask()`.

**Lógica**: No `handleConfirmAction` de `AdTimelineRadar.tsx` e `AdTimelineDetail.tsx`, após criar a action com sucesso, chamar `createTask` com:
- Título: `"[Encerrar] {título do anúncio}"` ou `"[Clonar] {título}"`
- Descrição: motivo informado
- Status: `todo`
- Prioridade: `medium`
- Tag: `linha-do-tempo`

**Arquivos**: `AdTimelineRadar.tsx`, `AdTimelineDetail.tsx`

---

### 4. Filtros de Status ML e Estoque

Adicionar 2 selects na barra de filtros:
- **Status ML**: Todos / Ativo / Pausado / Fechado / Inativo
- **Estoque**: Todos / Sem estoque / Com estoque

Filtragem client-side no `useMemo` existente (dados já estão enriquecidos).

**Arquivo**: `AdTimelineRadar.tsx`

---

### 5. Coluna "Total Vendido" + info no detalhe + filtro "nunca vendeu"

A tabela `meli_listings_cache` já tem `sold_quantity`. O enriquecimento já puxa dados dessa tabela.

**Lista (Radar)**:
- Adicionar coluna "Total" após "90d" mostrando `sold_quantity` do listing cache
- Adicionar ao tipo `AdTimelineStats` o campo `sold_quantity`
- Incluir `sold_quantity` no select do enriquecimento em `useAdTimeline.ts`

**Detalhe**:
- Adicionar "Total vendido (histórico)" na seção de Vendas por Período

**Filtro melhorado**:
- Renomear "Sem vendas" para "Nunca vendeu" (bucket NO_SALES = items que nunca venderam)
- Adicionar opção "Já vendeu" no filtro (= tudo menos NO_SALES, ou seja OK + 30D + 60D + 90D + 120D)

**Arquivos**: `useAdTimeline.ts`, `AdTimelineRadar.tsx`, `AdTimelineDetail.tsx`, `ad-timeline.ts` (tipos)

---

### 6. Incluir `sold_quantity` na edge function de enriquecimento

A edge function `ad-timeline-enrich-items` já busca dados da API do ML. O campo `sold_quantity` já vem na resposta da API. Basta incluí-lo no upsert para `meli_listings_cache`.

**Arquivo**: `supabase/functions/ad-timeline-enrich-items/index.ts`

---

### Resumo de arquivos
| Arquivo | Ação |
|---|---|
| `src/pages/AdTimelineRadar.tsx` | Dropdown exportar, filtros Status/Estoque, coluna Total, remover Republicar, criar tarefa |
| `src/pages/AdTimelineDetail.tsx` | Remover Republicar, total vendido, criar tarefa |
| `src/hooks/useAdTimeline.ts` | Incluir `sold_quantity` no enriquecimento |
| `src/types/ad-timeline.ts` | Adicionar `sold_quantity` |
| `src/utils/exportTimeline.ts` | Novo — funções de export Excel/PDF |
| `src/components/ad-timeline/ActionDrawer.tsx` | Remover RELIST da UI |
| `supabase/functions/ad-timeline-enrich-items/index.ts` | Incluir `sold_quantity` no upsert |
| `package.json` | Adicionar `xlsx` |

