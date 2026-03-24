

# Plano corretivo — Radiografia (4 problemas)

## Diagnóstico confirmado

### Problema 1: Keywords descartadas sem possibilidade de reversão
O sistema descarta keywords por filtro semântico e as exibe como "descartadas por irrelevância" (seção cinza no card SEO). Não há botão para o seller reverter — se uma keyword descartada é relevante ao produto, ele não pode recuperá-la. A tabela `listing_keyword_feedback` já existe mas só funciona para keywords da lista principal (👍/👎). Descartadas ficam presas.

### Problema 2: Atacado mostra "0 faixas" mesmo com faixas ativas
A screenshot do ML confirma 2 faixas (2un 3% OFF e 10un 10% OFF). O código detecta atacado via tag `standard_price_by_quantity` (Strategy 1, linha 3115) e marca `hasMLWholesale=true` mas deixa `mlRangesCount=0`. Strategy 2 (prices API) roda em seguida mas o filtro por `context_restrictions` ou `min_purchase_unit` pode não bater com a estrutura real retornada pela API do ML. Resultado: `ranges_count: 0` no JSON, frontend exibe "Ativo (0 faixas)".

### Problema 3: Visitas mostram "0 Visitas" no header do gráfico
O gráfico plota corretamente os picos de visitas (13/03, 16/03, 20/03), mas o `EvolutionPill` no header calcula `delta = último_ponto - primeiro_ponto`. Como o primeiro e último ponto do período são ambos ~0, exibe "0 Visitas". Não é que visitas não estão sendo coletadas — é que o indicador resume errado.

### Problema 4: `visits_last` no health card também pode estar 0
Se a última coleta capturou um dia sem visitas, `visits_last` fica 0 mesmo que nos 7 dias anteriores houve dezenas de visitas. O campo deveria representar o total da janela, não o valor do último dia.

---

## Correções

### 1. Botão "Reverter" nas keywords descartadas
**Arquivo:** `src/components/radiography/RadiographyDetailPanel.tsx`
- Na seção de "palavras descartadas por irrelevância" (linhas 1461-1484), adicionar um botão `↩ Reverter` ao lado de cada keyword descartada.
- Ao clicar, gravar na `listing_keyword_feedback` com `is_relevant = true`, sinalizando que o seller quer a palavra de volta.
- Mover visualmente a keyword da lista "descartadas" para a lista "relevantes" (com badge de "resgatada pelo seller").
- Na próxima análise SEO, o backend já lê `listing_keyword_feedback` e deve respeitar `is_relevant = true` como override do filtro automático.

**Arquivo:** `supabase/functions/radiography-collector/index.ts`
- No fluxo de filtragem de keywords (onde aplica blocklist/semântica), verificar se a keyword tem feedback `is_relevant = true` antes de descartar. Se sim, manter na lista de relevantes independentemente do score semântico.
- Logar: `KEYWORD_RESTORED: "{keyword}" por feedback do seller`.

### 2. Corrigir contagem de faixas de atacado
**Arquivo:** `supabase/functions/radiography-collector/index.ts` (linhas 3100-3190)
- Quando Strategy 1 detecta via tag mas `mlRangesCount` fica 0, Strategy 2 já roda (linha 3136). O problema está nos filtros `pxqPrices`:
  - Adicionar detecção por `p.amount !== undefined && p.conditions?.start_quantity > 1` (estrutura real usada pelo ML para PxQ).
  - Adicionar fallback: contar entradas com `conditions.start_quantity` distintos como faixas.
- Se após ambas as strategies `ranges_count` continua 0 mas `hasMLWholesale = true` (tag confirmada), setar `ranges_count` = pelo menos 1 como mínimo garantido e logar `WHOLESALE_RANGES_ESTIMATED`.
- No `positives`, usar a contagem real quando disponível.

### 3. Corrigir indicador "0 Visitas" no header do gráfico
**Arquivo:** `src/components/radiography/RadiographyDetailPanel.tsx` (linhas 641-644)
- Substituir o `EvolutionPill` de Visitas para mostrar o **total acumulado** de visitas no período (soma de todos os pontos) em vez do delta primeiro→último.
- Manter o delta para Preço e Estoque (faz sentido nessas métricas).
- Formato: `∑ 62 Visitas` (soma) com seta de tendência baseada na comparação entre primeira e segunda metade do período.

### 4. Garantir `visits_last` represente janela completa
**Arquivo:** `supabase/functions/radiography-collector/index.ts` (linha 873)
- O campo `visits` usado para `visits_last` vem da API `items/visits` com `date_from/date_to` de 7 dias. Verificar que o `date_from` está correto (7 dias atrás, não apenas "hoje").
- Se a API retorna visitas por dia (array), somar todos os valores da janela em vez de pegar apenas o último.
- Logar `VISITS_FETCH: item={id}, raw_value={v}, window=7d, source={api_response_type}`.

---

## Arquivos impactados
- `src/components/radiography/RadiographyDetailPanel.tsx` (reversão de keywords + fix do pill de visitas)
- `supabase/functions/radiography-collector/index.ts` (respeitar feedback na filtragem + fix atacado ranges + log de visitas)

## Validação de aceite
1. Keyword descartada pode ser revertida com 1 clique e reaparece na lista de relevantes.
2. Produto com atacado ativo no ML (2 faixas) mostra "Ativo (2 faixas)" no card.
3. Header do gráfico mostra total real de visitas do período, não delta zero.
4. O health factor "Tráfego" reflete as visitas acumuladas da janela.

