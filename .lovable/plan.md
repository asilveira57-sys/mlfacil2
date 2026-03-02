

# Diagnóstico: Custos sendo zerados na recalculação

## Causa Raiz Identificada

Encontrei **2 erros críticos de SQL** que ocorrem em **CADA recalculação de pedido**, confirmados nos logs do banco:

### Erro 1: `column meli_orders_cache.shipping_state does not exist`
- O código V2 (`calculateOrderProfit` e `calculateSingleOrder`) faz `select ... shipping_state` da tabela `meli_orders_cache`
- **Essa coluna NÃO existe.** A tabela só tem `shipment_id`
- O `shipping_state` (estado de destino para DIFAL) nunca foi criado na migration
- Resultado: a query de busca do pedido **falha silenciosamente**, retornando dados incompletos ou nulos, o que zera os custos no cálculo

### Erro 2: `column marketplace_accounts.ml_account_id does not exist`
- A função `resolveCompanyId()` (linha 179) busca `marketplace_accounts.ml_account_id`
- **Essa coluna NÃO existe.** A tabela tem `external_user_id` (não `ml_account_id`)
- Resultado: `company_id` retorna `null`, impedindo a busca de configuração de impostos e embalagens
- O fallback para `ml_accounts` funciona, mas o erro fica registrado a cada chamada

### Consequência em cadeia
Quando esses erros ocorrem durante o bulk reimport (que está rodando agora, visível nos logs):
1. Query do pedido falha → dados do pedido ficam incompletos
2. Company_id falha na primeira tentativa → overhead desnecessário
3. Custos de comissão/frete que já existiam no cache são **sobrescritos com zeros** pelo recálculo que falha parcialmente

---

## Correção

### 1. Adicionar coluna `shipping_state` na `meli_orders_cache`
- Migration: `ALTER TABLE meli_orders_cache ADD COLUMN shipping_state varchar(2)`
- Popular a partir dos dados de shipping já existentes (ou da API)

### 2. Corrigir `resolveCompanyId`
- Trocar `ml_account_id` por `external_user_id` na query da `marketplace_accounts`

### 3. Proteger contra sobrescrita destrutiva
- No `calculateOrderProfit`: antes de gravar zeros no cache, verificar se já existem valores reais e não sobrescrever com zeros
- Adicionar guard: se a query do pedido falhar, abortar o cálculo daquele pedido em vez de gravar zeros

### Ordem de execução
1. Migration SQL (adicionar coluna + corrigir referência)
2. Corrigir edge function (2 pontos: query column + resolveCompanyId)
3. Deploy edge function

