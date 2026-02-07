
# Melhoria da Central de Promocoes - Dados Reais da API + Selecao em Massa + Filtros

## Diagnostico

### Problema dos dados faltantes (desconto e "Voce recebe")
Analisando os dados no banco, **todos os itens** estao com `promo_price = NULL`, `discount_percent = NULL`. Isso acontece porque o sync atual extrai apenas `deal_price` da API, que retorna `null` para promocoes do tipo BANK (desconto no Pix/cartao).

Porem, a API do Mercado Livre retorna **campos adicionais** que o sync nao esta capturando:

- **`price`**: preco promocional efetivo (diferente de `deal_price`, preenchido mesmo em promocoes BANK)
- **`net_proceeds.amount`**: valor liquido que o vendedor recebe (exatamente o "Voce recebe" do screenshot)
- **`max_discounted_price`**, **`min_discounted_price`**, **`suggested_discounted_price`**: faixa de precos permitida

O campo `net_proceeds` eh o dado **oficial da API** que mostra quanto o vendedor recebe, ja descontando a comissao real da categoria -- nao uma estimativa de 13% ou 16%.

### Problema da interface
- Sem caixas de selecao para marcar itens
- Sem filtro por percentual de desconto
- Sem ordenacao por desconto ou preco
- Sem informacao de "valor compartilhado" / "Voce recebe"

## Solucao em 4 Frentes

### 1. Migracao SQL - Novas colunas na tabela

Adicionar as seguintes colunas em `promotion_items_snapshots`:

| Coluna | Tipo | Descricao |
|---|---|---|
| `effective_price` | NUMERIC | Preco promocional efetivo (campo `price` da API) |
| `net_proceeds_amount` | NUMERIC | "Voce recebe" - valor liquido (campo `net_proceeds.amount`) |
| `net_proceeds_currency` | TEXT | Moeda do net_proceeds |
| `suggested_price` | NUMERIC | Preco sugerido pelo ML |
| `max_discounted_price` | NUMERIC | Preco maximo com desconto |
| `min_discounted_price` | NUMERIC | Preco minimo com desconto |
| `raw_item_data` | JSONB | JSON bruto da API para garantir que nenhum campo futuro seja perdido |

### 2. Atualizacao do Edge Function `promotions-sync`

Capturar os novos campos da resposta da API:

```text
Antes (atual):
  item_id, status, original_price, deal_price, error

Depois (novo):
  item_id, status, original_price, deal_price,
  price, net_proceeds.amount, net_proceeds.currency,
  suggested_discounted_price, max_discounted_price,
  min_discounted_price, error, + raw JSON completo
```

Tambem melhorar o calculo de `discount_percent` usando fallbacks:
1. Se `deal_price` existe: desconto = `(1 - deal_price/original_price) * 100`
2. Se `price` existe e eh diferente de `original_price`: desconto = `(1 - price/original_price) * 100`
3. Se nenhum: `null`

### 3. Atualizacao do Frontend - Hook e Tipos

Atualizar `PromotionItemSnapshot` e `EnrichedPromotionItem` para incluir:
- `effective_price`
- `net_proceeds_amount`
- `suggested_price`
- `max_discounted_price`
- `min_discounted_price`

Tambem trazer `listing_type_id` do `meli_listings_cache` para exibir o tipo de anuncio (Classico/Premium).

### 4. Atualizacao da Interface - Modal com Selecao, Filtros e Ordenacao

#### Selecao em Massa
- Checkbox em cada card de item
- Checkbox "Selecionar Todos" no topo (seleciona apenas itens filtrados)
- Botoes "Aderir Selecionados" e "Remover Selecionados" aparecem quando ha selecao
- Selecao resetada quando filtros mudam

#### Barra de Filtros e Ordenacao
```text
[Buscar titulo/SKU...] [Status: Todos v] [Desc. max: ____%] [Ordenar: Desconto v]
```
- Busca por titulo, SKU ou MLB ID
- Filtro por status (Participando / Candidato / Inelegivel)
- Filtro por desconto maximo (ex: "somente menores que 15%")
- Ordenacao por: % desconto, preco, status, "Voce recebe"

#### Card de Item Atualizado
Cada card passara a exibir:

```text
+---------------------------------------------------------------+
| [x] [IMG] Titulo do Produto Completo                          |
|            SKU: ABC123 | MLB1234567890 | Classico              |
|                                                                |
|      R$ 82,75         R$ 38,81 (-53%)         Voce recebe      |
|      preco original   preco final              R$ 27,85        |
|                                                                |
|      Status: Candidato                         [Aderir]        |
+---------------------------------------------------------------+
```

- Preco original riscado
- Preco final em destaque (verde)
- Badge de desconto percentual
- "Voce recebe" com o valor real da API (`net_proceeds_amount`)
- Se `net_proceeds` nao estiver disponivel, exibir "-" (sem estimativa)
- Tipo de anuncio (Classico/Premium) como badge discreta

## Detalhes Tecnicos

### Arquivos a modificar

| Arquivo | Acao |
|---|---|
| Nova migracao SQL | Adicionar 7 colunas em `promotion_items_snapshots` |
| `supabase/functions/promotions-sync/index.ts` | Capturar `price`, `net_proceeds`, faixas de preco, raw JSON |
| `src/hooks/usePromotions.ts` | Atualizar tipo `PromotionItemSnapshot` com novos campos |
| `src/hooks/useEnrichedPromotionItems.ts` | Trazer `listing_type_id` do cache, expor novos campos |
| `src/components/promotions/PromotionDetailModal.tsx` | Adicionar filtros, ordenacao, selecao em massa |
| `src/components/promotions/PromotionItemCard.tsx` | Exibir checkbox, `net_proceeds`, desconto, tipo anuncio |
| `src/pages/Promocoes.tsx` | Ajustar callbacks para acoes em massa com itens selecionados |

### Logica de selecao em massa

- Estado `selectedIds: Set<string>` gerenciado no `PromotionDetailModal`
- "Selecionar Todos" opera apenas sobre itens **visíveis apos filtro**
- Botoes de acao em massa operam sobre itens selecionados do tipo correto (ex: so candidatos para "Aderir")
- Reset automatico ao mudar filtro

### Logica de filtros (useMemo no modal)

Aplicar em sequencia sobre `items`:
1. Busca por texto (titulo, SKU, item_id)
2. Filtro por status
3. Filtro por desconto maximo
4. Ordenacao selecionada

### Ordem de execucao

1. Migracao SQL: adicionar colunas
2. Atualizar `promotions-sync` para capturar novos campos + deploy
3. Atualizar tipos TypeScript (`PromotionItemSnapshot`)
4. Expandir `useEnrichedPromotionItems` com `listing_type_id`
5. Refatorar `PromotionDetailModal` com filtros, sort e selecao
6. Atualizar `PromotionItemCard` com novos dados visuais
7. Ajustar `Promocoes.tsx` para acoes em massa

### Nota importante sobre `net_proceeds`

O campo `net_proceeds` so aparece na resposta da API quando o item **tem preco final definido** (status `started` ou `candidate` com preco). Para itens `candidate` com `price = 0`, o campo pode nao estar presente. Nesse caso, o card exibira "-" na coluna "Voce recebe".

Apos a implementacao, sera necessario **re-sincronizar** as promocoes para que os novos campos sejam preenchidos no banco.
