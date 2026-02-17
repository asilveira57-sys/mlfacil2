

# Enriquecer Resultados por Produto e Melhorar Fluxo de Participacao

## Problema Atual

1. **Informacoes insuficientes nos resultados de busca por produto**: Cada linha de campanha mostra apenas nome, tipo e um icone de co-participacao (tooltip). Faltam: percentual de desconto, valor de co-participacao, data de finalizacao.

2. **Clicar em "Participar" abre o modal com TODOS os itens da campanha**: O usuario pesquisa "etiqueta fragil", clica em Participar na campanha "Impulsione suas vendas", mas o modal abre com 27 itens em vez de filtrar apenas o produto pesquisado.

## Solucao

### 1. Enriquecer as linhas de campanha no card de produto

Adicionar na mesma linha de cada campanha (inline, sem precisar clicar):
- Percentual de desconto (ex: "3% off")
- Valor de co-participacao ML em verde (ex: "ML reduz R$ 0,19")
- Data de finalizacao (ex: "Termina em 3 dias" ou "14/03")
- Preco original riscado e preco promocional

**Arquivo:** `src/hooks/useProductPromotionSearch.ts`
- Adicionar `start_at` e `end_at` na query de `promotion_snapshots` (linha 149)
- Adicionar esses campos na interface `ProductPromotionInfo`
- Calcular `discount_percentage` a partir de `original_price` e `promo_price`

**Arquivo:** `src/pages/Promocoes.tsx` (componente `ProductPromotionCard`, linhas 804-868)
- Redesenhar cada linha de campanha para exibir inline:
  - Nome da campanha + tipo badge
  - Desconto: "X% off" 
  - Co-participacao ML: "ML reduz R$ X,XX" em verde (quando houver)
  - Data fim: "Termina dd/MM" ou "Termina em X dias"
  - Precos: original riscado + promocional
  - Botao Participar / Badge "Participando"

### 2. Participar filtrado pelo produto pesquisado

Quando clicar em "Participar" no resultado de busca por produto, em vez de abrir o modal generico com todos os itens, abrir um dialog compacto focado naquele produto especifico naquela campanha, com opcao de confirmar a adesao direto.

**Arquivo:** `src/pages/Promocoes.tsx`
- Novo estado `productAction` para controlar a adesao direta de um produto especifico
- Ao clicar "Participar" no `ProductPromotionCard`, disparar a acao diretamente via `confirmAction` (ja existe o dialog de confirmacao) passando o `item_id`, `offer_id` e `price` do produto + `promotion_id`
- Nao abrir mais o `PromotionDetailModal` ao clicar Participar no resultado por produto

### Detalhes Tecnicos

**Interface `ProductPromotionInfo` atualizada:**

```text
export interface ProductPromotionInfo {
  promotion_id: string;
  promotion_name: string | null;
  promotion_type: string;
  promotion_status: string;
  item_status: string;
  meli_percentage: number | null;
  offer_id: string | null;
  original_price: number | null;
  promo_price: number | null;
  feeReductionAmount: number | null;
  start_at: string | null;   // novo
  end_at: string | null;     // novo
}
```

**Query atualizada em `useProductPromotionSearch.ts` (linha 148-149):**

```text
.select('promotion_id, promotion_name, promotion_type, status, start_at, end_at')
```

**`ProductPromotionCard` redesenhado (Promocoes.tsx):**

Cada linha de campanha passara de:
```text
[Nome] [TIPO] [icone] ............... [Participar]
```

Para:
```text
[Nome] [TIPO] | 3% off | ML reduz R$0,19 | Termina 14/03 | R$31,03 > R$30,88 | [Participar]
```

**Acao "Participar" direta:**

Ao clicar Participar no card de produto, em vez de `onSelectPromotion(promoId)` que abre o modal grande, o sistema dispara diretamente o `setConfirmAction` com os dados do item (`item_id`, `price`, `offer_id`) e o `promotion_id`, abrindo o dialog de confirmacao ja existente. Sera necessario ajustar o `handlePromotionAction` para aceitar um `promotion_id` parametrizado (atualmente usa `selectedPromotion`).

### Impacto nos Arquivos

| Arquivo | Acao |
|---------|------|
| `src/hooks/useProductPromotionSearch.ts` | Adicionar `start_at`, `end_at` na query e interface |
| `src/pages/Promocoes.tsx` | Redesenhar `ProductPromotionCard` com info inline; mudar acao "Participar" para adesao direta |

