

## Problema

O dialog "Vincular Categoria a Perfil" busca categorias diretamente do `activeAccount?.sellerId` (conta ativa global). O usuário quer primeiro selecionar a empresa de destino e depois ver apenas as categorias que aquela empresa/conta trabalha.

## Plano

### 1. Adicionar seletor de empresa no dialog `WholesaleCategoryBindings.tsx`

- Importar `useWorkspaceCompanies` para listar empresas ativas
- Adicionar estado `selectedCompanyId` no dialog
- Buscar a `marketplace_account` vinculada à empresa selecionada (query na tabela `marketplace_accounts` por `company_id`)
- Derivar o `sellerId` (`external_user_id`) da conta vinculada à empresa escolhida
- Passar esse `sellerId` dinâmico para `useSellerCategories` ao invés do `activeAccount?.sellerId`

### 2. Ajustar fluxo do dialog

- **Passo 1**: Selecionar empresa → ao selecionar, buscar conta de marketplace vinculada
- **Passo 2**: Com o `sellerId` resolvido, carregar categorias via `useSellerCategories`
- **Passo 3**: Selecionar perfil e categoria (fluxo atual)
- Se a empresa não tem conta vinculada, exibir mensagem informativa
- Pré-selecionar a empresa da conta ativa atual como default

### 3. Alterações nos arquivos

- **`src/components/wholesale/WholesaleCategoryBindings.tsx`**: Adicionar select de empresa no topo do dialog, estado para `selectedCompanyId`, query para buscar `marketplace_accounts.external_user_id` pela empresa, e usar esse seller ID para filtrar categorias. Aumentar o `p_limit` de 12 para um valor maior (ex: 50) para cobrir todas as categorias da empresa.

