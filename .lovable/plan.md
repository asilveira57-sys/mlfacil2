
Plano corretivo definitivo — Título sem variação no Radiografia

Do I know what the issue is? Sim.

Diagnóstico confirmado (com evidência)
- O item MLB4076266967 continua salvo com 81 caracteres em `listing_health_current.title` e `seo_analysis_json.title_analysis.length=81`.
- A limpeza atual depende de `variations.attribute_combinations`; quando o ML “concatena” sufixo no título (ex.: “Branco Nenhum”) sem variação útil para extração, a limpeza não acontece.
- O frontend ainda usa `item.title` bruto em pontos críticos do card (“67/60”), então o erro visual reaparece mesmo após tentativas parciais.
- No gerador de títulos há inconsistência de variável no código atual (`variationAttrs`), que precisa ser corrigida para evitar regressão.

Correção (cirúrgica e única fonte de verdade)
1) Criar normalizador único de título canônico no backend
- Arquivo: `supabase/functions/radiography-collector/index.ts`
- Nova função utilitária (ex.: `getCanonicalMlTitle`) com regra fixa:
  - Se `rawTitle.length <= 60`: manter.
  - Se `> 60`: remover sufixos de variação no final (nome + valor), em múltiplas passagens.
  - Se ainda `> 60`: tentar remover sufixos de atributos finais comuns concatenados pelo ML (somente no fim do título).
  - Fallback confiável: usar título de `meli_order_items_cache.title` quando houver match do mesmo item/seller e tamanho válido.
  - Guarda final obrigatória: garantir `canonical.length <= 60` (corte por palavra, não no meio).
- Retornar metadados de normalização: estratégia aplicada, tokens removidos, tamanho antes/depois.

2) Aplicar o título canônico em TODOS os fluxos
- `handleAnalyze`: persistir `listing_health_current.title` com título canônico (não bruto).
- `analyzeSeoForItems`: usar título canônico para `computeTitleSeo` e também para aderência (hoje há uso de título bruto em parte do cálculo).
- `handleGenerateTitle`: partir do título canônico e corrigir a inconsistência de variável (`variationAttrs`) para estabilizar geração.

3) Ajustar frontend para nunca reintroduzir título bruto
- Arquivo: `src/components/radiography/RadiographyDetailPanel.tsx`
- Em “Título atual” e no gerador:
  - Priorizar tamanho/texto canônico vindo da análise (`title_analysis.length` + título canônico persistido).
  - Não disparar alerta vermelho se canônico <= 60.
  - Exibir observação didática quando houve limpeza de variação (“Variação removida do cálculo”).

4) Logging obrigatório para auditoria
- Registrar por item: `raw_length`, `canonical_length`, `normalization_strategy`, `removed_suffix_tokens`, `applied_fallback`.
- Assim, se voltar a ocorrer, fica rastreável sem tentativa cega.

Validação de aceite (obrigatória)
- MLB4076266967 deve aparecer <= 60 no card e sem alerta de excesso.
- “Branco Nenhum” não pode entrar no cálculo de caracteres.
- Gerar Títulos deve funcionar e retornar `current_length <= 60`.
- Um item sem concatenação indevida deve permanecer sem alteração de conteúdo útil.
- Reprocessamento completo deve atualizar banco + UI de forma consistente (sem depender de refresh manual múltiplo).

Arquivos impactados
- `supabase/functions/radiography-collector/index.ts`
- `src/components/radiography/RadiographyDetailPanel.tsx`
- (se necessário para tipagem/consumo) `src/hooks/useRadiographyData.ts`
