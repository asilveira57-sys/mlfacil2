

# Melhoria do Modulo de Promocoes - Tela de Detalhes Rica

## Problema Atual

Conforme identificado no screenshot:

1. O detalhe da promocao abre em um **Sheet lateral estreito** (`sm:max-w-xl` = ~576px), cabendo apenas 2 itens por vez
2. Os itens mostram apenas o **MLB ID** (ex: `MLB5212738374`) sem informacao do produto
3. A barra de rolagem eh muito curta e "pula" ao ser manipulada (area de scroll de apenas ~400px)
4. Nao ha thumbnail, titulo, SKU -- informacoes essenciais para identificar o produto
5. A experiencia eh inferior ao proprio Mercado Livre

## Solucao Proposta

### 1. Substituir Sheet por Dialog em tela cheia

Trocar o componente `Sheet` (painel lateral) por um `Dialog` (modal centralizado) ocupando **90% da tela** (`max-w-6xl`, ~1152px de largura). Isso permite mostrar 8-10 itens visiveis simultaneamente sem scroll excessivo.

### 2. Enriquecer itens com dados do produto

Ao abrir o detalhe de uma promocao, fazer um JOIN local com `meli_listings_cache` para trazer:
- **Thumbnail** (imagem do produto)
- **Titulo** do anuncio
- **SKU** (quando disponivel)
- **Permalink** (link do anuncio)

Isso sera feito no hook `usePromotionItems`, adicionando uma segunda query que busca os dados visuais dos itens.

### 3. Layout visual dos itens (cards em grid)

Substituir a tabela simples por um **grid de cards** com layout:

```text
+------------------------------------------+
| [IMG] Titulo do Produto                  |
|        SKU: ABC123 | MLB1234567890       |
|        R$ 120,00 --> R$ 89,90  (-25%)    |
|        Status: Candidato    [Aderir]     |
+------------------------------------------+
```

Cada card tera ~80px de altura, permitindo 8-10 itens visiveis na area de scroll (que tera ~650px de altura).

### 4. Cabecalho do modal otimizado

Reorganizar o cabecalho com informacoes da promocao em layout horizontal compacto, liberando espaco vertical para os itens.

## Detalhes Tecnicos

### Arquivos a modificar

| Arquivo | Acao |
|---|---|
| `src/hooks/usePromotionItems.ts` (dentro de `usePromotions.ts`) | Enriquecer itens com dados de `meli_listings_cache` |
| `src/pages/Promocoes.tsx` | Substituir Sheet por Dialog full-screen, novo layout de cards |

### Enriquecimento de dados (usePromotionItems)

Apos buscar os itens da promocao, fazer uma segunda query:

```text
SELECT item_id, title, thumbnail, sku, permalink
FROM meli_listings_cache
WHERE item_id IN (lista dos item_ids)
AND seller_id = sellerId
```

Mesclar os resultados criando um tipo `EnrichedPromotionItem` que inclui `title`, `thumbnail`, `sku` e `permalink`.

### Novo layout do Dialog

- `Dialog` com `max-w-6xl w-[90vw]` e altura `max-h-[90vh]`
- Cabecalho compacto: nome, tipo, status, datas e KPIs em linha unica
- Acoes (Aderir Todos, Planejar Renovacao) logo abaixo do cabecalho
- Area de itens com `ScrollArea` de `h-[calc(90vh-280px)]` (~650px)
- Grid de cards responsivo: 1 coluna em telas menores, layout rico

### Estrutura do card de item

Cada card tera:
- Thumbnail 56x56px com fallback (icone Package)
- Titulo truncado em 2 linhas
- SKU (se disponivel) + MLB ID como link
- Preco original riscado + preco promocional em destaque
- Badge de desconto percentual
- Badge de status (Candidato, Participando, Inelegivel)
- Botao de acao contextual (Aderir/Remover)
- Para itens inelegiveis: motivo do erro em tooltip

### Ordem de execucao

1. Atualizar hook `usePromotionItems` para enriquecer com dados visuais
2. Criar componente `PromotionDetailModal` com Dialog full-screen
3. Criar componente `PromotionItemCard` com layout rico
4. Atualizar `Promocoes.tsx` para usar o novo modal em vez do Sheet
5. Remover imports nao utilizados do Sheet

