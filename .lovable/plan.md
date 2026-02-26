

## Problemas Identificados

**Bug raiz**: O `addBinding` em `useWholesaleCategoryBindings` sempre usa `activeAccount.companyId` (empresa ativa global), ignorando a empresa selecionada no dialog. Resultado: todos os vínculos são salvos com o `company_id` errado.

**Lista**: Não mostra a qual empresa pertence cada vínculo, tornando impossível distinguir.

**Preview**: Busca itens de um seller mas usa vínculos que podem ter sido gravados com company_id incorreto (consequência do bug acima).

**Filtro por categoria**: A aba "Por Categoria" é apenas um resumo estático, sem funcionalidade de filtro nos itens.

---

## Plano de Correção

### 1. Fix: `useWholesaleCategoryBindings.ts` — aceitar `company_id` no mutation

- Adicionar campo opcional `company_id` ao input do `addBinding`
- Se fornecido, usar esse valor em vez do `activeAccount.companyId`
- Remover filtro `.eq("company_id", companyId)` da query principal — listar vínculos de TODAS as empresas do usuário (a RLS já garante segurança)
- Fazer join com `companies(display_name)` para trazer o nome da empresa

### 2. Fix: `WholesaleCategoryBindings.tsx` — passar `company_id` do dialog

- No `handleAdd`, passar `company_id: selectedCompanyId` para o mutation
- Adicionar coluna "Empresa" na tabela de vínculos, exibindo `company_display_name`
- Adicionar filtro/busca que inclua o nome da empresa

### 3. Fix: Preview — filtro por categoria

- `WholesalePreview.tsx`: adicionar um `<Select>` de filtro por categoria acima da tabela de itens
- Extrair lista de categorias únicas dos `previewData.rows`
- Filtrar `filteredRows` pelo `category_id` selecionado (além da busca por texto)
- Tornar a aba "Por Categoria" clicável: ao clicar em uma categoria no resumo, mudar para aba "Itens" com o filtro aplicado

### 4. Schema: adicionar `company_display_name` ao retorno dos bindings

- Alterar a query de bindings para incluir join com `companies(display_name)` 
- Mapear como `company_name` no retorno

---

## Arquivos Alterados

| Arquivo | Mudança |
|---|---|
| `src/hooks/useWholesaleCategoryBindings.ts` | Aceitar `company_id` no mutation; remover filtro por empresa ativa na listagem; join com `companies` |
| `src/components/wholesale/WholesaleCategoryBindings.tsx` | Passar `company_id` no handleAdd; coluna "Empresa" na tabela |
| `src/components/wholesale/WholesalePreview.tsx` | Filtro por categoria no tab "Itens"; clique no resumo de categoria para filtrar |

