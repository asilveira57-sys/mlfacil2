

# Diagnóstico: Custos Reais Sendo Sobrescritos por Zeros

## Causa Raiz

Encontrei o problema central. Existem **dois caminhos** que escrevem no `order_cost_breakdown_cache`:

1. **`ml-sync-real-costs`** — busca comissão, frete e parcelamento reais da API do ML e grava nos campos `fee_ml`, `shipping_cost_seller`, `installments_cost` + popula `meli_order_financials_cache`
2. **`cost-engine/calculate`** — lê de `meli_order_financials_cache` e grava em `commission_cost`, `cost_fees`, `cost_shipping`

O problema:
- `meli_order_financials_cache` está **vazia** (0 registros para o seller)
- Quando o `calculateCosts` roda, ele lê essa tabela vazia, obtém `commissionCost = 0`, `costShipping = 0` e **sobrescreve** o breakdown
- Os valores reais que `ml-sync-real-costs` gravou em `fee_ml` são preservados mas **não são usados** pelo cálculo de custo — o cálculo usa `commission_cost` que fica zero
- Resultado: 124 dos 404 pedidos recentes têm comissão zerada

```text
Fluxo atual (quebrado):
ml-sync-real-costs → grava fee_ml=11.99, shipping=28.45 ✓
cost-engine/calculate → lê financials_cache (vazio) → commission_cost=0, cost_shipping=0 ✗
                        → sobrescreve profit/margin com zeros
```

## Correção

### Na `calculateCosts` e `calculateSingleOrder` (cost-engine):
1. **Antes de calcular**, ler os valores existentes do `order_cost_breakdown_cache` para cada pedido
2. **Fallback**: se `meli_order_financials_cache` não tiver dados, usar os valores existentes (`fee_ml`, `shipping_cost_seller`, `installments_cost`) do breakdown atual
3. **Nunca sobrescrever** `commission_cost` com zero se `fee_ml` já tem valor real
4. Unificar o campo `commission_cost` para usar `fee_ml` como fonte quando disponível

### Lógica de merge (pseudo-código):
```text
commissionCost = billing?.cost_sale_fee           // financials cache
              || existing?.fee_ml                   // breakdown existente (ml-sync-real-costs)
              || 0

shippingCost   = billing?.cost_shipping_fee
              || existing?.shipping_cost_seller
              || 0

installments   = billing?.cost_installment_fee
              || existing?.installments_cost
              || 0
```

### Arquivos afetados:
- `supabase/functions/cost-engine/index.ts` — funções `calculateCosts` e `calculateSingleOrder`
- Deploy da edge function

### O que NÃO muda:
- O `ml-sync-real-costs` continua sendo a fonte primária dos custos reais
- A lógica de impostos, embalagem e custo de produto permanece intacta
- Nenhuma migration de banco necessária

