
Plano corretivo definitivo (erro de caracteres + keywords sumidas)

Do I know what the issue is? Sim.

Diagnóstico (com evidência)
1) Erro de caracteres persiste por SEO desatualizado (não por título real):
- `listing_health_current.title` já está limpo (ex.: 54/55 chars),
- mas `seo_analysis_json.title_analysis.length` ficou antigo (ex.: 61/62/67).
- Evidência: `seo_updated_at` de vários itens ficou em 2026-03-22, enquanto `updated_at` foi atualizado hoje.
- Causa: no `handleAnalyze`, quando o processamento encosta no timeout, ele faz `skipping SEO` e deixa JSON antigo.

2) Keywords “sumiram”:
- `market_keywords_cache` está vazio (`0` linhas / `0` categorias).
- O refresh atual depende de colunas de `meli_order_items_cache` que não batem com o schema real (consulta quebra silenciosamente e não popula nada).
- Resultado: `total_keywords=0`, `details=[]` em vários itens.

3) Front ainda pode mostrar estado incoerente:
- Card de título usa fallback para `item.title` quando `title_analysis` está ausente/desatualizado, então reaparece `62/60` mesmo com título canônico já salvo.

Escopo da correção
- Corrigir a origem dos dados (SEO sempre atualizado e keywords realmente disponíveis).
- Remover fallback visual enganoso no frontend.
- Garantir regra definitiva: contagem de 60 sempre baseada no título canônico sem variação.

Implementação proposta

Fase 1 — SEO nunca mais ficar “stale”
1. Em `supabase/functions/radiography-collector/index.ts`:
- Remover a lógica “skip SEO near timeout” para o lote inteiro.
- Processar SEO em chunks menores (ex.: 20–40 itens por chamada) com self-chain de continuação quando aproximar timeout.
- Persistir checkpoint (último item processado) para concluir 100% dos itens.
- Ao final do fluxo, todos os itens analisados devem ter `seo_updated_at` da execução atual.

2. No fluxo `full`:
- Manter `sync/collection/analyze`, mas garantir que análise SEO completa finalize em cadeia (sem deixar itens com JSON antigo).

Fase 2 — Reativar keywords com fonte válida
1. Em `handleRefreshMarketKeywords`:
- Corrigir leitura da base de vendas para colunas reais da tabela (sem depender de campos inexistentes).
- Validar erro de query explicitamente (não seguir silenciosamente com categoria vazia).
- Popular `market_keywords_cache` por categorias ativas do seller (sem limite artificial de registros).

2. Em `analyzeSeoForItems`:
- Garantir fallback contextual obrigatório quando categoria vier sem keywords:
  - se categoria = 0 keywords, gerar palavras do próprio anúncio (título + descrição + atributos).
  - nunca retornar `details=[]` quando há texto útil no anúncio.
- Logar métricas por item: `raw_keywords`, `filtered_keywords`, `fallback_used`.

Fase 3 — Regra definitiva dos 60 caracteres
1. Backend:
- Consolidar `getCanonicalTitle` para remover sufixo de variação completo (nome + valor), não apenas parte.
- Salvar no `seo_analysis_json.title_analysis`:
  - `raw_length`, `canonical_length`,
  - `variation_removed=true/false`,
  - `removed_tokens`.
- Score e limite usam somente `canonical_length`.

2. Frontend (`src/components/radiography/RadiographyDetailPanel.tsx`):
- No card de título, usar apenas `title_analysis.canonical_length` para contador e alerta.
- Não usar `item.title` bruto para pintar vermelho.
- Se `title_analysis` ausente, mostrar “análise pendente” (não mostrar 62/60 bruto).

Fase 4 — Verificação e bloqueio de regressão
1. Criar validações de aceite:
- Nenhum item com `title_analysis.limit_status='above_limit'` quando `canonical_length <= 60`.
- Itens com variação “Cor Branco/Nenhum” devem exibir “variação removida do cálculo”.
- `market_keywords_cache` com volume > 0 após refresh.
- `details` de SEO preenchido para itens com descrição/atributos.

2. Logs obrigatórios:
- `SEO_ANALYSIS_STARTED/COMPLETED` com `items_total`, `items_processed`, `items_remaining`.
- `REFRESH_KEYWORDS_*` com `categories_processed`, `keywords_written`.
- `TITLE_CANONICALIZATION` com before/after por item (amostrado).

Arquivos impactados
- `supabase/functions/radiography-collector/index.ts`
- `src/components/radiography/RadiographyDetailPanel.tsx`
- (se necessário para estado de “análise pendente”) `src/hooks/useRadiographyData.ts`

Resultado esperado após correção
- O erro de “título acima de 60” desaparece de forma definitiva para anúncios com variação concatenada.
- As keywords voltam a aparecer com contexto real do anúncio/categoria.
- O seller deixa de ver inconsistência entre título exibido e score SEO.
