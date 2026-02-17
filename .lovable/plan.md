
# Exibir Reducao de Tarifa nas Promocoes

## O que esta acontecendo

O Mercado Livre mostra em verde "Reduzimos R$ X,XX das suas tarifas por cada venda" nos itens de campanhas co-financiadas (SMART, PRICE_MATCHING, MARKETPLACE_CAMPAIGN). Esse valor representa a parcela que o ML paga do desconto.

Os dados **ja existem** no banco de dados dentro do campo `raw_item_data`:
- `meli_percentage`: percentual do desconto que o ML paga (ex: 0.6%, 1.8%, 2.4%)
- `seller_percentage`: percentual do desconto que o vendedor paga

O calculo do valor de reducao de tarifa e: `original_price * meli_percentage / 100`

Exemplo real do banco:
- original_price: R$ 41,38 | meli_percentage: 1.6% -> Reducao = R$ 0,66
- original_price: R$ 190,96 | meli_percentage: 1.6% -> Reducao = R$ 3,06

## Plano de Implementacao

### 1. Hook `useEnrichedPromotionItems.ts`
- Extrair `meli_percentage` e `seller_percentage` do `raw_item_data`
- Calcular `feeReductionAmount = original_price * meli_percentage / 100`
- Adicionar campos ao `EnrichedPromotionItem`:
  - `meliPercentage: number | null`
  - `sellerPercentage: number | null`  
  - `feeReductionAmount: number | null`

### 2. Componente `PromotionItemCard.tsx`
- Na coluna "Voce recebe", abaixo do valor de net_proceeds (quando disponivel), exibir em verde:
  - "Reduzimos R$ X,XX das suas tarifas por cada venda"
- Quando `net_proceeds_amount` for null mas `feeReductionAmount` existir, exibir apenas a reducao de tarifa (sem o "Voce recebe" numerico, que ficou para implementacao futura)
- Quando nenhum dos dois existir, manter o "-" atual

### Detalhes Tecnicos

**Extracao no hook (useEnrichedPromotionItems.ts):**

```text
const meliPercentage = rawData?.meli_percentage as number | null;
const sellerPercentage = rawData?.seller_percentage as number | null;
const feeReductionAmount = (meliPercentage && item.original_price) 
  ? item.original_price * meliPercentage / 100 
  : null;
```

**Exibicao no card (PromotionItemCard.tsx):**

Na secao "Voce recebe" (linhas 163-174), adicionar abaixo do valor:

```text
{item.feeReductionAmount && (
  <span className="text-xs text-green-600 leading-tight">
    Reduzimos R$ {item.feeReductionAmount.toFixed(2)} das suas tarifas por cada venda
  </span>
)}
```

**Interface atualizada do EnrichedPromotionItem:**

```text
export interface EnrichedPromotionItem extends PromotionItemSnapshot {
  // ... campos existentes ...
  meliPercentage: number | null;
  sellerPercentage: number | null;
  feeReductionAmount: number | null;
}
```

### Impacto nos arquivos

| Arquivo | Acao |
|---------|------|
| `src/hooks/useEnrichedPromotionItems.ts` | Extrair meli/seller percentage e calcular reducao |
| `src/components/promotions/PromotionItemCard.tsx` | Exibir reducao de tarifa em verde |

Nenhuma mudanca no backend necessaria - os dados ja estao no `raw_item_data`.
