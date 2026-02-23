
# Redesign do Painel de Configuracao do Agente

## Problema Atual

O painel do agente usa um Drawer lateral estreito (~480px) que sobrepoe a tela inteira, fica alinhado a esquerda, exige scroll, e os seletores de categoria/produto sao textareas manuais pouco praticos.

## Solucao

### 1. Trocar Drawer por Dialog centralizado em 3 colunas

Substituir o componente `Drawer` (Vaul) por um `Dialog` (Radix) centralizado com largura maxima de ~1100px e altura maxima de ~85vh. O conteudo sera distribuido em 3 colunas separadas por linhas verticais (`border-r`):

```text
+------------------------------+------------------------------+------------------------------+
| COLUNA 1                     | COLUNA 2                     | COLUNA 3                     |
| Status + Ativar/Desativar    | Escopo de Produtos           | Guardrails                   |
| Executar agora               |   - Todos / Categoria / Item | Estoque minimo               |
|                              |   - Seletor de categorias    | Margem minima                |
| Regras de Desconto           |   - Buscador de produtos     | Aderir sem margem            |
|   - Max seller %             |   - Lista de exclusao        |                              |
|   - Min total %              |                              | Tipos de Campanha            |
|   - Coparticipacao           |                              |   - SMART, DEAL, etc.        |
|                              |                              |   - Aceitar unknown          |
|                              |                              |                              |
|                              |                              | Historico (ultimas execucoes)|
+------------------------------+------------------------------+------------------------------+
|                          [ Salvar Configuracao ]                                            |
+--------------------------------------------------------------------------------------------+
```

O fluxo do seller: coluna esquerda (regras basicas) -> coluna central (escopo) -> coluna direita (guardrails + historico) -> salvar.

### 2. Seletor de Categorias com dados reais do seller

Quando o seller escolher escopo "Por categoria", em vez de um textarea manual, sera exibida uma lista com checkboxes usando os dados do hook `useSellerCategories(sellerId)` ja existente no sistema. Isso traz as categorias reais onde o seller vende, com nome legivel e GMV.

- Lista com checkbox + nome da categoria + badge com GMV
- Categorias selecionadas ficam marcadas
- Se nao houver categorias sincronizadas, exibir mensagem orientando sync

### 3. Buscador de Produtos com pesquisa

Quando o seller escolher escopo "Por lista de itens", em vez de um textarea com MLBs:

- Campo de busca com debounce (3+ caracteres)
- Buscar em `promotion_items_snapshots` (items candidatos) usando `ilike` no `item_id` e enriquecendo com dados da tabela (titulo, thumbnail, SKU)
- Resultados em lista com checkbox, thumbnail, titulo e MLB
- Items selecionados ficam como badges/chips removiveis abaixo do campo
- Mesmo padrao para a "Lista de exclusao"

### 4. Responsividade

Em telas menores (<768px), as 3 colunas empilham verticalmente com separadores horizontais, mantendo o scroll interno do dialog.

---

## Detalhes Tecnicos

### Arquivo editado: `src/components/promotions/PromotionAgentConfig.tsx`

Mudancas principais:

1. **Imports**: Trocar `Drawer/DrawerContent/DrawerHeader/DrawerTitle/DrawerDescription` por `Dialog/DialogContent/DialogHeader/DialogTitle/DialogDescription` de `@/components/ui/dialog`

2. **Layout**: O `DialogContent` tera `className="max-w-[1100px] w-[95vw] max-h-[85vh] p-0"` com grid interno `grid grid-cols-1 md:grid-cols-3`

3. **Coluna 1**: Status + Regras de Desconto (conteudo atual sem mudanca)

4. **Coluna 2**: Escopo de Produtos
   - Importar `useSellerCategories` de `@/hooks/useSellerCategories`
   - Criar sub-componente `CategorySelector`: lista de checkboxes com categorias do seller
   - Criar sub-componente `ProductSearchSelector`: input de busca + resultados com checkboxes + chips dos selecionados
   - A busca de produtos usara query direta em `promotion_items_snapshots` com `ilike` por `item_id` e join com dados enriquecidos

5. **Coluna 3**: Tipos de Campanha + Guardrails + Historico (conteudo atual reorganizado)

6. **Footer**: Botao "Salvar" full-width no rodape do dialog, fora das colunas

### Nenhum arquivo novo necessario

Toda a mudanca e interna ao `PromotionAgentConfig.tsx`, reutilizando hooks existentes (`useSellerCategories`, busca em `promotion_items_snapshots`).

### Props mantidas

A interface `PromotionAgentConfigProps` continua identica - `open`, `onOpenChange`, `workspaceId`, `sellerId`.
