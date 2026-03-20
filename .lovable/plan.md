
Diagnóstico objetivo (conta ADECONEX.SP)

1) O filtro de período da lista hoje é “visual”, não de dados
- Em `RadiographyItemList.tsx`, o `selectedPeriod` só alimenta o `<Select>`.
- A lista usa campos fixos de `listing_health_current` (`visits_last`, `sales_count_30d`, `conversion_rate_7d`), sem recalcular por 7/15/30/150 dias.
- Resultado: trocar período não muda visitas/vendas/conversão na listagem.

2) O detalhe também não muda por falta de série temporal útil
- `fetchItemHistory` filtra `listing_health_history.collected_at`, mas para ADECONEX.SP os dados estão concentrados no mesmo dia.
- Banco (seller `1411095727`):
  - `listing_health_history`: 809 linhas, **1 dia distinto** (`20/03`).
  - Item exemplo `MLB3852550991`: 5 linhas e todas caem em qualquer filtro (7/15/30/60/150).
- Resultado: gráfico parece “travado” e período parece sem efeito.

3) Causa raiz da data repetida no histórico
- No `radiography-collector` (backfill), `collected_at` é salvo com “agora” (`new Date()`), não com a data histórica da janela.
- Isso comprime backfill em um único dia no gráfico.

4) Armazenamento histórico real hoje (ADECONEX.SP)
- `seller_item_visits`: 276 linhas, 86 itens, 8 dias distintos (`13/03` a `20/03`).
- Ou seja: existe histórico diário parcial, mas a UI da Radiografia não usa essa base para o filtro principal.

Plano cirúrgico para colocar o filtro para funcionar (urgente)

Fase 1 — Corrigir o vínculo do filtro com dados reais (lista + detalhe)
1. Atualizar `useRadiographyData` para receber `selectedPeriod` e recalcular métricas por período.
2. Incluir uma query agregada por item (via função SQL/RPC) com:
   - visitas no período (de `seller_item_visits`)
   - vendas/unidades no período (de `meli_order_items_cache`)
   - conversão do período
3. Mesclar esses campos no payload da listagem e substituir, na UI:
   - `visits_last` -> `visits_period`
   - `sales_count_30d` -> `sales_period`
   - conversão fixa -> `conversion_period`
4. Ajustar ordenação da lista para usar métricas do período selecionado.

Fase 2 — Corrigir gráfico e série temporal do detalhe
1. Trocar fonte do gráfico para série diária real:
   - base primária: `seller_item_visits` (por dia)
   - overlay de preço/estoque: `listing_health_history` (snapshot mais próximo do dia)
2. Gerar série contínua diária (sem “buracos”) para 7/15/30/60/150.
3. Corrigir efeitos no painel:
   - recarregar quando `period`, `item` ou `selectedPeriod` mudar.
4. Se histórico disponível for menor que o período:
   - exibir aviso claro “dados históricos insuficientes para X dias” (sem fingir erro de UI).

Fase 3 — Corrigir persistência do backfill (causa da data fixa)
1. No `radiography-collector`, alterar backfill para salvar referência temporal histórica:
   - `collected_at` da janela (ex.: fim da janela), não `now()`.
2. (Recomendado) adicionar `window_start` e `window_end` em `listing_health_history` para rastreabilidade e idempotência robusta.
3. Manter `listing_health_current` como snapshot rápido (sem quebrar arquitetura atual).

Fase 4 — Reparo de dados da ADECONEX.SP
1. Resetar `radiography_backfill_control` do seller `1411095727` para reprocessar com a regra corrigida.
2. Reexecutar backfill para reconstruir histórico em datas corretas.
3. Rodar uma coleta operacional + enrich para sincronizar estado atual com histórico.

Fase 5 — Observabilidade e estabilidade
1. Corrigir log de `enrich_sales` para usar `metadata_json` (hoje usa `metadata`, pode deixar log “running” preso).
2. Adicionar logs de período aplicado na UI/backend:
   - seller_id, days_range, registros retornados, cobertura de dias.
3. Adicionar validação automática:
   - se todas datas do gráfico forem iguais -> flag `INVALID_TIME_SERIES`.
   - se troca de período não alterar query/resultset -> flag `FILTER_NOT_APPLIED`.

Arquivos/partes a ajustar

Frontend
- `src/hooks/useRadiographyData.ts`
  - incluir `selectedPeriod` na busca de métricas e no contrato retornado.
- `src/pages/Radiografia.tsx`
  - passar `selectedPeriod` para o hook.
- `src/components/radiography/RadiographyItemList.tsx`
  - exibir/ordenar por métricas do período.
- `src/components/radiography/RadiographyDetailPanel.tsx`
  - gráfico diário por período + reload correto.

Backend/database
- `supabase/functions/radiography-collector/index.ts`
  - corrigir timestamp do backfill (histórico real).
  - ajustar log `metadata_json` no enrich.
- Nova migration
  - função SQL para agregação por período (visitas/vendas/conversão por item).
  - (opcional recomendado) colunas `window_start/window_end` em `listing_health_history`.

Validação final (checklist rápido)
1. Lista:
- mudar 7 -> 30 -> 150 e confirmar alteração de visitas/vendas/conversão (quando houver histórico suficiente).
2. Detalhe:
- eixo X com datas diferentes (não repetir só 20/03).
- trocar período e verificar mudança no dataset.
3. Banco:
- `listing_health_history` com múltiplos dias reais após reprocesso.
- `radiography_collection_logs` sem execuções “running” presas indevidas.
4. UX:
- quando faltar histórico para 150d, mostrar insuficiência de dados (sem mascarar como “normal”).

Resultado esperado após esse plano
- filtro passa a ter efeito real na lista e no detalhe;
- gráfico deixa de ficar “travado” por data única;
- conversão/vendas/visitas deixam de ser percepção estática;
- histórico volta a refletir o tempo corretamente para decisão.
