

## Plano: Substituir Input de Categoria por Seletor Visual

### Problema
O campo "Categoria" no formulário de clone é um `<Input>` que espera o ID MLB da categoria (ex: `MLB1234`). Nenhum seller sabe isso de cabeça — gera erro e frustração.

### Solução
Criar um componente `CategoryPicker` que:
1. Mostra as categorias que o seller já vende (via `useSellerCategories`) como opções prioritárias
2. Permite busca livre por nome usando a API pública do ML (`/sites/MLB/categories/search?q=...`)
3. Se a origem já trouxe `category_id`, mostra como selecionada por padrão

### Arquivos a criar/alterar

**1. Novo: `src/components/clone-turbo/CategoryPicker.tsx`**
- Componente com Popover (trigger = botão mostrando categoria selecionada ou placeholder)
- Seção "Suas categorias" — lista do `useSellerCategories(accountId)` com nome e GMV
- Seção "Buscar categoria" — input de busca que faz fetch em `https://api.mercadolibre.com/sites/MLB/domain_discovery/search?q={termo}&limit=10` retornando categorias com nome completo
- Ao selecionar, chama `onSelect(categoryId, categoryName)`
- Se `originCategoryId` já existir, mostra como badge "Origem: {nome}"

**2. Alterar: `src/components/clone-turbo/CloneDraftForm.tsx`**
- Props: adicionar `accountId: string | null` para passar ao CategoryPicker
- Substituir o `<Input>` de `category_id` (linhas 114-121) pelo `<CategoryPicker>`
- O picker chama `onUserPayloadChange({ category_id })` ao selecionar

**3. Alterar: `src/pages/ClonarAnuncio.tsx`**
- Passar `selectedAccountId` mapeado para `ml_user_id` como prop `accountId` ao `CloneDraftForm`

### Fluxo do usuário
1. Abre clone, cola URL, formulário carrega
2. Campo "Categoria" mostra a categoria da origem (se veio) ou "Selecionar categoria"
3. Clica → abre popover com suas 3-4 categorias principais em destaque
4. Pode digitar para buscar qualquer categoria do ML por nome
5. Seleciona → fecha popover, campo atualizado

### Detalhes técnicos
- API de busca: `GET https://api.mercadolibre.com/sites/MLB/domain_discovery/search?q={query}&limit=10` — retorna `domain_id`, `domain_name`, `category_id`, `category_name`
- Fallback se API falhar: manter input de texto livre como último recurso
- Debounce de 400ms na busca

