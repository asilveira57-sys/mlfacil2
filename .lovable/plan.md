

# Plano Corretivo: Atacado, Mídia, Título e Geração de Títulos

## Diagnóstico confirmado (com evidência do banco)

### 1. Atacado — "Não configurado (CNPJ)" quando tem atacado real
**Causa raiz:** O sistema verifica atacado APENAS nas tabelas internas (`wholesale_product_overrides`, `wholesale_seller_settings`) que estão vazias para este tenant. A configuração real de atacado é feita diretamente no Mercado Livre (screenshot mostra faixas de preço no ML). O sistema ignora completamente o atacado configurado no ML.

**Sobre a mensagem:** "Status: Não configurado (CNPJ)" é confusa — parece que CNPJ não está configurado. Na verdade indica que é conta CNPJ mas sem atacado detectado.

### 2. Título — contando variação como parte do título
**Causa raiz:** A tabela `meli_listings_cache` armazena o título com variação concatenada pela API do ML. Exemplo real no banco:
- Armazenado: `"Etiqueta Adesiva Papel Couchê 33x22mm Borda Vermelha Rolo 4000 Unid Branco Nenhum"` (81 chars)
- Título real: `"Etiqueta Adesiva Papel Couchê 33x22mm Borda Vermelha Rolo 4000 Unid"` (sem "Branco Nenhum")

O enrich usa `item.title` direto da API multiget, que retorna título + variação.

### 3. Resolução — "0/3 em 1200x1200" mas "1ª imagem OK"
**Causa raiz dupla:**
- "1ª imagem OK" verifica apenas `item.thumbnail` (se existe URL), não resolução real
- "0/3 em 1200x1200" está correto: nenhuma imagem tem exatamente 1200x1200 (primeira é 1200x868)
- Inconsistência visual: parece contradição

### 4. Media per-image data não aparece
**Causa raiz:** `MediaCard` lê `(item as any).media_analysis_json` que não existe como coluna em `listing_health_current`. Os dados estão em `listing_media_analysis.analysis_json` mas nunca são carregados no frontend query.

### 5. Geração de título — "Item not found in listings cache"
**Causa raiz:** O `handleGenerateTitle` busca em `meli_listings_cache` usando `seller_id` mas o item pode existir com `seller_id` diferente, ou a query falha silenciosamente. Precisa validação melhor e fallback.

---

## Correções

### Fase A — Atacado: detectar config real do ML

**Arquivo:** `supabase/functions/radiography-collector/index.ts`

1. Na função `analyzeWholesaleForItem`, antes de verificar tabelas internas, consultar a API do ML para verificar se o item tem `sale_terms` com tipo `WHOLESALE`:
   - `GET /items/{item_id}?attributes=sale_terms` com token
   - Se `sale_terms` contiver entry com `id: "WHOLESALE"` → atacado ativo no ML
   - Salvar `has_ml_wholesale: true` no resultado
2. Prioridade de detecção: ML API primeiro → tabelas internas como fallback
3. Se ML tem atacado configurado → score 80+ (sem verificar tabelas internas)
4. Corrigir mensagem: substituir "Status: Não configurado (CNPJ)" por:
   - Com atacado ML: "Status: Ativo no Mercado Livre"
   - Sem atacado ML nem interno: "Status: Preço de atacado não configurado"
   - Conta CPF: "Status: Indisponível para CPF"

### Fase B — Título: limpar variação

**Arquivo:** `supabase/functions/radiography-collector/index.ts`

1. Na análise SEO e no `handleGenerateTitle`, ao ler `listing.title` da API ou cache:
   - Buscar `variations[0].attribute_combinations` via API multiget (já usado no detail fetch)
   - Remover sufixos de variação do título: para cada `value_name` das attribute_combinations, fazer trim do final do título
   - Exemplo: título "...Rolo 4000 Unid Branco Nenhum" → remover "Branco" e "Nenhum" se são values de variação
2. Armazenar em `listing_health_current.title` o título limpo (sem variação)
3. Usar o título limpo para cálculo de caracteres no SEO e exibição

### Fase C — Mídia: corrigir inconsistência e carregar dados

**Arquivo:** `src/hooks/useRadiographyData.ts`
1. No query de items, fazer join com `listing_media_analysis` para trazer `analysis_json` como `media_analysis_json` no objeto retornado
2. Adicionar ao HealthCurrentItem interface: `media_analysis_json`

**Arquivo:** `src/components/radiography/RadiographyDetailPanel.tsx`
1. Corrigir "1ª imagem OK": usar dados reais de resolução da primeira imagem do `per_image` array, não apenas existência de thumbnail
   - Se primeira imagem é 1200x1200 → "OK"
   - Se primeira imagem existe mas não é 1200x1200 → mostrar dimensão real
   - Se sem dados → "Sem dados"

### Fase D — Geração de título: fix lookup

**Arquivo:** `supabase/functions/radiography-collector/index.ts`
1. No `handleGenerateTitle`, se item não encontrado em `meli_listings_cache`, buscar em `listing_health_current` como fallback
2. Se ainda não encontrado, retornar mensagem amigável ao invés de erro técnico

### Fase E — Deploy e reprocessamento
1. Deploy do collector atualizado
2. Reprocessar análise para atualizar dados de atacado e título limpo

---

## Arquivos modificados
1. `supabase/functions/radiography-collector/index.ts` — atacado via API ML, título sem variação, fix generate_title
2. `src/hooks/useRadiographyData.ts` — join media_analysis, interface update
3. `src/components/radiography/RadiographyDetailPanel.tsx` — fix 1ª imagem, fix mensagem atacado

