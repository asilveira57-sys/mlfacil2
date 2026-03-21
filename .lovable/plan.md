
Diagnóstico confirmado (com evidência do banco)

1) A análise inteligente não está sendo executada no fluxo manual de atualização.
- Hoje o botão “Atualizar Dados” chama `full` + `enrich_sales`, mas não chama `analyze`.
- Resultado direto: `listing_health_current` fica com defaults (`health_score=0`, `photos_count=0`, `has_video=false`, `catalog_product_id=null`).

2) O estado atual está “zerado” globalmente.
- `listing_health_current`: 1653/1653 com score 0 e fotos 0.
- `listing_media_analysis`: 0 linhas.
- Para seller `1411095727`: 162/162 com score 0 e foto 0.

3) Catálogo está falso-negativo por fonte errada/insuficiente.
- Exemplo `MLB4024945991`: em `meli_listings_cache` existe `catalog_product_id`, mas em `listing_health_current` está `null`.
- A recomendação usa `listing_health_current`; por isso sugere “vincular catálogo” mesmo quando já está vinculado.

Plano cirúrgico de correção

Fase A — Corrigir pipeline para nunca ficar zerado
1. Backend (`supabase/functions/radiography-collector/index.ts`)
- No `action: "full"`, encadear também `analyze` (além de backfill), para todo refresh manual recalcular score/mídia/catálogo.
- Ajustar `enrich_sales` para logar em `metadata_json` (não `metadata`) e não deixar log “running” preso.

2. Frontend (`src/hooks/useRadiographyData.ts`)
- No `triggerUpdate`, garantir sequência operacional: `full` -> `enrich_sales` -> `analyze` (ou `full` com chain assíncrono + polling leve de status).
- Refetch só após confirmação de término da análise.

Fase B — Corrigir diagnóstico de mídia e catálogo na origem
3. Análise de item no collector
- Expandir fetch de detalhes por item para usar dados confiáveis da API no `analyze`:
  - `catalog_product_id`, `shipping/logistic_type`, `pictures`, `video_id`, `title`, `thumbnail`, `permalink`.
- Priorizar API no merge (cache apenas fallback).
- Persistir em `listing_health_current`: `catalog_product_id`, `catalog_listing`, `logistic_type`, `shipping_mode`, `photos_count`, `has_video`, `health_score`, `health_status`, `main_problem`.

4. Mídia avançada (requisito 1200x1200 + fundo branco)
- Em `listing_media_analysis.analysis_json`, salvar:
  - `photos_count`, `has_video`,
  - `first_image_resolution`, `min_resolution_ok (>=1200x1200)`,
  - `white_background_status` (heurística clara/escura com confiança + `unknown` quando não for possível validar).
- Consolidar no item atual (campos derivados) para lista rápida e sem recalcular no frontend.

Fase C — UI fiel ao dado real
5. Lista + detalhe
- `src/components/radiography/RadiographyItemList.tsx`
  - badges/filtros “Com vídeo/Sem vídeo”, “Poucas fotos”, “Score” baseados nos campos já consolidados.
- `src/components/radiography/RadiographyDetailPanel.tsx`
  - seção Mídia mostrar:
    - quantidade de fotos,
    - vídeo sim/não,
    - resolução da 1ª imagem e status 1200x1200,
    - status de fundo branco (ou “não avaliado”).
- Recomendações:
  - bloquear “vincular catálogo” se `catalog_product_id` existir.
  - bloquear “considerar Full” se já for Full.

Fase D — Reprocessamento e validação imediata
6. Reprocessar dados já coletados (sem apagar histórico)
- Executar análise completa para todos sellers ativos e, com prioridade, seller ADECONEX.
- Confirmar que os campos deixam de ficar zerados.

Checklist de aceite (obrigatório)
- Score: deixa de ser 0 em massa.
- Foto: deixa de ser 0 em massa.
- Vídeo: filtro “Com vídeo” passa a retornar itens quando houver.
- Catálogo: item já vinculado não recebe recomendação de vincular novamente.
- Exemplo validado: anúncio informado pelo link de catálogo deve aparecer como “Catálogo: Sim”.
- Detalhe exibe 1200x1200 e fundo branco com status honesto (ou “não avaliado”).
