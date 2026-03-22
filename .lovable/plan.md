
Plano corretivo imediato — Radiografia (Atacado + Rota + Título + Modelo + Mídia)

Diagnóstico (confirmado)
- Do I know what the issue is? Sim.
- Atacado falso-negativo: o item MLB4076266967 está com `wholesale_analysis_json.status = not_configured`, mas a detecção atual usa critérios errados para PxQ.
- Causa raiz técnica: `analyzeWholesaleForItem` procura `sale_terms` com `WHOLESALE/QUANTITY_DISCOUNTS` e `prices.type='bulk'`; a doc oficial de PxQ indica detecção por:
  - tag `standard_price_by_quantity` no item
  - preços `type: "standard"` com `conditions.min_purchase_unit` + `context_restrictions` contendo `user_type_business`.
- 404 do botão: `RadiographyDetailPanel` abre `/ferramentas/preco-atacado`, rota inexistente (rota real é `/atacado`).
- Título ainda inflado: `generate_title` e parte do SEO dependem de variação via `variations.attribute_combinations`; no item em questão a limpeza não remove “Branco Nenhum” (retorno atual: `variation_attrs_excluded: []`).
- Modelo “100” com pouco conteúdo: regra atual considera “ok” com `length >= 3`, sem avaliar profundidade semântica mínima.
- Mídia: backend já avalia todas imagens, mas a UI ainda não deixa isso óbvio no estado fechado.

Implementação (cirúrgica)
1) Corrigir detecção de atacado (prioridade máxima)
- Arquivo: `supabase/functions/radiography-collector/index.ts`
- Em `analyzeWholesaleForItem`:
  - detectar atacado por `item.tags` contendo `standard_price_by_quantity`;
  - detectar faixas por `/items/{id}/prices` lendo nós `type="standard"` com `conditions.min_purchase_unit` e `context_restrictions` com `user_type_business`;
  - manter fallback interno (tabelas) apenas se API não responder.
- Ajustar status/mensagens:
  - `active`: “Ativo no Mercado Livre”
  - `not_configured`: “Preço de atacado não configurado”
  - nunca mostrar texto ambíguo “não configurado (CNPJ)”.
- Adicionar logs obrigatórios por item: fonte da detecção, quantidade de faixas, motivo do status.

2) Corrigir rota quebrada (404)
- Arquivo: `src/components/radiography/RadiographyDetailPanel.tsx`
  - trocar CTA para `/atacado` (com query de contexto do item).
- Arquivo: `src/App.tsx`
  - criar alias de compatibilidade `/ferramentas/preco-atacado` → redirect para `/atacado` (evita regressão de links antigos).

3) Corrigir título real (sem variação) para SEO e geração
- Arquivo: `supabase/functions/radiography-collector/index.ts`
- Criar função única `sanitizeListingTitle(...)` reutilizada em:
  - `handleAnalyze` (persistência em `listing_health_current.title`)
  - `analyzeSeoForItems` (cálculo de `title_score`)
  - `handleGenerateTitle` (current_title/current_length)
- Estratégia de limpeza:
  - remover sufixos de variação por combinações + atributos típicos de variação no final do título (cor, padrão, voltagem, etc.), sem remover termos centrais.
- Resultado esperado: item não penalizado por “Branco Nenhum” quando isso for variação.

4) Modelo mais exigente (didático/acionável)
- Arquivo: `supabase/functions/radiography-collector/index.ts` (`computeModelSeo`)
- Nova régua:
  - curto demais (ex.: 3–12) = score baixo/médio;
  - só recebe score alto quando for específico + pesquisável + comprimento útil.
- Incluir em `model_analysis`:
  - `length`, `length_status`, `space_usage_hint` com recomendação clara para aproveitar melhor o campo.

5) Mídia mais clara no frontend
- Arquivo: `src/components/radiography/RadiographyDetailPanel.tsx`
- Manter regra atual, mas exibir mais claramente:
  - resumo “X/Y em 1200x1200”;
  - lista por imagem visível com status (não só escondida em expansão).
- Evitar ambiguidade entre “1ª imagem” e “resolução total”.

Validação de aceite (com o item informado)
- MLB4076266967 deve aparecer com atacado ativo (ou com motivo técnico explícito e logado se API negar).
- Botão “Configurar preço de atacado” não pode abrir 404.
- Título no SEO e no gerador deve usar título sem sufixo de variação.
- Modelo curto não pode permanecer “100” automaticamente.
- Card de mídia deve mostrar claramente a checagem de todas as imagens.
