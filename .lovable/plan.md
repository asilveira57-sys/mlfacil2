
# Melhorias no Modulo ADS - Campanhas

## Problemas Identificados
1. Campanhas desativadas exibidas como "Ativa" - o `mapStatus` ja foi corrigido, mas campanhas antigas no banco ainda podem ter status errado. A sincronizacao precisa tambem buscar campanhas com todos os status (nao apenas `active,paused`).
2. Limite de 50 campanhas na tabela - a tabela exibe todas de uma vez sem paginacao.
3. Falta de colunas CPC e TACOS na tabela principal.
4. Sem pesquisa, ordenacao ou paginacao.
5. Barra de navegacao entre guias com muito espaco.

## Solucao

### 1. Edge Function: Sincronizar TODOS os status

No `fetchCampaigns`, a API ja busca todas as campanhas. Porem no `fetchItems`, o parametro `status=active,paused` exclui itens com outros status. Corrigir para incluir todos os status ou remover o filtro de status.

Arquivo: `supabase/functions/ads-sync/index.ts`
- Linha 390: mudar `status=active,paused` para incluir todos os status possiveis, ou remover o filtro

### 2. Tabela de Campanhas: Layout compacto + novas colunas

Arquivo: `src/components/ads/AdsCampaignsTable.tsx`

Refatorar completamente a tabela:
- **Colunas mais compactas**: usar `text-xs`, padding reduzido (`px-2 py-1`)
- **Novas colunas**: CPC (calculado: spent/clicks) e TACOS (calculado: spent/revenue * 100)
- **Pesquisa**: campo de busca no topo filtrando por nome, tipo, SKU ou MLB
- **Ordenacao por coluna**: clicar no header ordena asc/desc por aquela metrica
- **Paginacao**: 10 campanhas por pagina com navegacao prev/next
- **Responsividade**: overflow-x-auto para telas menores

### 3. Calculos de CPC e TACOS na tabela principal

CPC e TACOS ja existem no `AdsCampaignProducts` (nivel produto). Para o nivel campanha:
- **CPC** = spent_total / clicks (precisa agregar clicks dos items da campanha, ou usar metrics do raw_data)
- **TACOS** = (spent_total / revenue) * 100

Usar os dados de `raw_data.metrics` que ja contem `clicks`, `cost`, `total_amount`.

### 4. Barra de navegacao entre guias

Substituir o `TabsList grid-cols-8` por um layout horizontal com scroll, usando `flex` e `overflow-x-auto` para caber melhor em telas menores e ter espacamento adequado.

---

## Detalhes Tecnicos

### Arquivos Modificados

**`supabase/functions/ads-sync/index.ts`**
- Remover filtro `status=active,paused` do `fetchItems` (linha ~390) para sincronizar todos os itens independente do status

**`src/components/ads/AdsCampaignsTable.tsx`** (refatoracao principal)
- Adicionar estado: `searchQuery`, `sortColumn`, `sortDirection`, `currentPage`
- Adicionar barra de pesquisa com `Input` (filtra por `name`, `campaign_type`, `ml_campaign_id`)
- Adicionar headers clicaveis com indicador de direcao (setas)
- Colunas ordenáveis: Campanha, Status, Orcamento, Gasto, Receita, CPC, ACOS, TACOS, ROAS
- Adicionar logica de paginacao (10 por pagina) com botoes Anterior/Proximo e indicador de pagina
- Adicionar colunas CPC e TACOS calculadas a partir de `raw_data.metrics`
- Reduzir padding e font-size para layout compacto (`text-xs`, `px-2 py-1.5`)
- Atualizar `colSpan` da linha expandida para refletir o novo numero de colunas

**`src/pages/Publicidade.tsx`**
- Alterar `TabsList` de `grid grid-cols-8` para `flex overflow-x-auto` com scroll horizontal
- Ajustar espacamento dos `TabsTrigger`

### Logica de Ordenacao

```text
sortColumn: 'name' | 'status' | 'budget' | 'spent' | 'revenue' | 'cpc' | 'acos' | 'tacos' | 'roas'
sortDirection: 'asc' | 'desc'

Pipeline: campaigns -> filter(search) -> sort(column, direction) -> paginate(page, 10)
```

### Logica de Pesquisa

Filtro case-insensitive por:
- `campaign.name`
- `campaign.campaign_type`
- `campaign.ml_campaign_id`

### Calculo CPC e TACOS (nivel campanha)

```text
metrics = campaign.raw_data?.metrics
clicks = metrics?.clicks || 0
spent = metrics?.cost || campaign.spent_total || 0
revenue = metrics?.total_amount || 0

CPC = clicks > 0 ? spent / clicks : 0
TACOS = revenue > 0 ? (spent / revenue) * 100 : 0
```
