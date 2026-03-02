

# Correção da Curva ABC no Módulo de Custos

## Problemas Identificados

1. **Mismatch de campo na resposta**: A API `getAbcProfit` retorna `{ data: [...] }` mas o frontend (`CostAbcProfit.tsx` linha 53) lê `data.items` — resultado: array sempre vazio.

2. **`display_name` é null**: O `calculateAbcForMetric` grava `display_name: null` (linha 1226) em vez de puxar o nome do produto dos aggregates.

## Correções

### 1. Frontend `CostAbcProfit.tsx`
- Linha 53: trocar `data.items` por `data.data` para alinhar com a resposta da API.

### 2. Edge Function `cost-engine/index.ts`
- Na função `calculateAbcForMetric` (linha 1226): preencher `display_name` a partir de `a.display_name` ou `a.product_key` dos aggregates.
- Verificar se `product_profit_aggregate_cache` tem o campo `display_name` populado; caso contrário, buscar dos order items.

### 3. Deploy
- Redeployar a edge function após a correção.

