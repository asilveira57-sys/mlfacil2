

## Analise: Por que o sistema não encontra o produto no Olist

### Problemas identificados

**Problema 1: O campo `preco_custo_medio` não está sendo lido**

A API do Tiny/Olist retorna dois campos de custo:
- `preco_custo` (Preço custo) -- na screenshot do usuário: **0,00**
- `preco_custo_medio` (Custo médio) -- na screenshot: **45,00**

O codigo atual (linha 1638) faz:
```typescript
const cost = parseFloat(product.preco_custo) || parseFloat(product.preco) || null;
```

Ele tenta `preco_custo` (que é 0), depois cai pro `preco` (preço de venda, 93,01). Nunca verifica `preco_custo_medio`. E como `preco_custo` = 0, o `parseFloat` retorna 0, que é falsy em JS, então cai pro `preco`. Mas o check `cost > 0` no final devolveria 93,01 (preço de venda), que está errado -- ou se `preco_custo` fosse lido como `0` e `preco` como preço de venda, retornaria o preço de venda errado.

Precisa adicionar `preco_custo_medio` na cascata de fallback.

**Problema 2: A pesquisa pode não encontrar o produto**

O parâmetro `pesquisa` da API Tiny busca por "Nome ou código (ou parte) do produto". O `searchTerm` é construído como `sku || item_id || product_key`.

O `product_key` no catálogo de custos vem do Mercado Livre (formato `MLB_ITEM_ID` ou similar), e o `item_id` também é do ML. Se o SKU estiver preenchido (ex: "RM110X74MCBR"), ele usa o SKU -- que deveria bater com o campo `codigo` no Tiny.

Esse caso pode funcionar se o SKU do ML for igual ao codigo do Tiny. Mas se não existir na resposta, retorna `null`. Preciso adicionar logs para diagnosticar se a busca retorna ou não.

### Correção proposta

**No `fetchOlistCost` (linhas 1617-1643):**

1. Adicionar `preco_custo_medio` na cascata de custo:
```typescript
const cost = parseFloat(product.preco_custo) 
  || parseFloat(product.preco_custo_medio) 
  || parseFloat(product.preco) 
  || null;
```

2. Adicionar log do retorno da API para diagnóstico:
```typescript
console.log('[cost-engine] Olist search result:', JSON.stringify({
  searchTerm, 
  found: data.retorno?.produtos?.length || 0,
  firstProduct: data.retorno?.produtos?.[0]?.produto?.codigo
}));
```

3. Garantir que `0` não seja tratado como falsy -- usar checagem explícita `!== null && !== undefined && > 0`.

### Arquivos a alterar

- `supabase/functions/cost-engine/index.ts` -- apenas a função `fetchOlistCost` (~5 linhas)
