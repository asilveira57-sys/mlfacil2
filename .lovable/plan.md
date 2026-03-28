

## Plano: Corrigir módulo de Gestão de Frete — peso, cálculo e ordenação

### Problemas identificados

1. **Peso exibido em gramas, não em kg**: A API do ML retorna peso em gramas no campo `SELLER_PACKAGE_WEIGHT` (ex: `1055`). O `freight-sync-dimensions` armazena esse valor direto como `weight_kg` sem dividir por 1000. Resultado: "1055 kg" quando deveria ser "1,055 kg".

2. **Botão "Calcular" dá erro**: O `FreightProductsTab` chama `supabase.functions.invoke('pricing-engine', { body: { action: 'validate', ... } })`. Porém o `pricing-engine` lê a ação da **URL** (`url.pathname.split('/').pop()`), não do body. Sem `/validate` no path, a action resolve como `pricing-engine` e retorna 404 "Ação não encontrada".

3. **Produtos sem dimensões**: Alguns anúncios no ML simplesmente não têm atributos `SELLER_PACKAGE_*` cadastrados (é responsabilidade do vendedor). Não é bug — é dado ausente na origem.

4. **Sem ordenação nas colunas**: Os cabeçalhos da tabela não são clicáveis para ordenar por peso, dimensões, perfil, frete esperado etc.

5. **Frete esperado não carrega automaticamente**: Mesmo com dimensões e tabela de frete cadastrada, o frete esperado não é calculado proativamente.

---

### Implementação

#### Etapa 1 — Corrigir unidade de peso (gramas → kg)
- No `freight-sync-dimensions/index.ts` e no `radiography-collector/index.ts`, ao extrair `SELLER_PACKAGE_WEIGHT`, dividir por 1000 se o valor for > 50 (heurística: ML retorna em gramas).
- Criar migração para corrigir dados já salvos: `UPDATE meli_listings_cache SET weight_kg = weight_kg / 1000 WHERE weight_kg > 50 AND dimensions_source = 'ml_api'`.

#### Etapa 2 — Corrigir botão "Calcular"
- No `FreightProductsTab.tsx`, alterar a chamada de `supabase.functions.invoke('pricing-engine', { body })` para usar o formato correto com path: `supabase.functions.invoke('pricing-engine/validate', { body })`.
- Garantir que o body inclui `workspace_id` (campo obrigatório do `handleValidate`).

#### Etapa 3 — Calcular frete esperado usando a tabela de frete local
- Em vez de depender do `pricing-engine` (que é um simulador completo), usar o `FreightEngine` (já existente em `src/lib/freightEngine.ts`) diretamente no frontend para calcular o frete esperado com base na tabela ativa + peso/dimensões do produto.
- Isso torna o cálculo instantâneo, sem chamada de edge function.

#### Etapa 4 — Ordenação em todas as colunas
- Adicionar estado de ordenação (`sortField`, `sortDirection`) ao `FreightProductsTab`.
- Cabeçalhos clicáveis com indicador visual (seta ↑↓).
- Colunas ordenáveis: Peso, Dimensões (soma), Perfil, Status, Frete Esperado, Título.

#### Etapa 5 — Indicação clara de "sem dados na origem"
- Para produtos sem dimensões após sync, mostrar tooltip explicando que o ML não tem esses dados cadastrados.

---

### Arquivos modificados

| Arquivo | Ação |
|---|---|
| `supabase/functions/freight-sync-dimensions/index.ts` | Dividir peso por 1000 |
| `supabase/functions/radiography-collector/index.ts` | Idem |
| Migração SQL | Corrigir pesos já salvos |
| `src/components/freight/FreightProductsTab.tsx` | Fix calcular, ordenação, cálculo local via FreightEngine |

### Resultado
- Peso exibido corretamente em kg
- Botão "Calcular" funciona usando o motor local de frete
- Todas as colunas ordenáveis por clique no cabeçalho
- Dados já salvos corrigidos via migração

