
# Corrigir Layout dos Acessos Rapidos na tela Inicio

## Problemas identificados (da screenshot)

1. Grid usa `xl:grid-cols-6` -- forca 6 colunas que estouram a area disponivel
2. Cards muito largos empurram o ultimo para fora da tela, criando barra de rolagem horizontal
3. O botao "Avaliar" e o card de avaliacao ficam escondidos abaixo dos cards que estouraram
4. Nao ha protecao contra overflow horizontal no container principal

## Mudancas planejadas

### 1. `src/components/dashboard/DashboardQuickActions.tsx`
- Alterar grid de `xl:grid-cols-6` para `xl:grid-cols-5` (maximo 5 por linha)
- Reduzir padding dos cards de `p-4` para `p-3`
- Reduzir icone de `w-12 h-12` para `w-10 h-10` e icone de `h-6 w-6` para `h-5 w-5`
- Limitar shortcuts exibidos a no maximo 5 (slice)
- Alterar skeleton grid para tambem usar 5 colunas

### 2. `src/components/layout/AppShellLayout.tsx`
- Adicionar `overflow-x-hidden` no container principal (`SidebarInset` ou div pai) para proibir rolagem horizontal em toda a aplicacao

### 3. `src/pages/Home.tsx`
- Adicionar `overflow-x-hidden` no container do conteudo da pagina como camada extra de protecao

### 4. Verificar botao de avaliar
- O `SmartSystemRatingCard` ja esta renderizado corretamente no codigo (linha 500-507 do Home.tsx)
- O problema e que ele fica empurrado para baixo e fora da viewport visivel por causa do overflow horizontal dos cards acima
- Ao corrigir o grid (itens 1-3), o card de avaliacao voltara a ficar visivel naturalmente

## Resumo das alteracoes por arquivo

| Arquivo | Alteracao |
|---------|-----------|
| `DashboardQuickActions.tsx` | Grid 5 cols, cards menores, max 5 shortcuts |
| `AppShellLayout.tsx` | `overflow-x-hidden` no container principal |
| `Home.tsx` | `overflow-x-hidden` no wrapper do conteudo |
