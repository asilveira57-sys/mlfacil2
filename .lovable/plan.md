

## Plano: Corrigir apagamento de dados de frete e destravar cálculo de custos

### Problema identificado

Tres processos estao sobrescrevendo dados de frete validos com zeros:

1. **`costs-nightly-sync` backfill** (linha 496-498): Faz `upsert` de registros com `cost_shipping: 0` para todos os pedidos, mesmo os que ja tinham frete real calculado. Esse e o culpado principal.

2. **`ml-sync-real-costs` handleReset** (linha 144-163): Ao resetar, zera `shipping_cost_seller`, `cost_shipping` e todos os campos financeiros indiscriminadamente.

3. **`cost-engine` recalculo** (linha 910-921): Quando nao encontra billing e o breakdown existente ja foi zerado pelo backfill, perpetua os zeros.

### Correcoes

#### Arquivo 1: `supabase/functions/costs-nightly-sync/index.ts`

**Mudanca**: Na funcao `processBackfill` (linha 496-498), trocar `upsert` por `upsert` com `ignoreDuplicates: true`. Assim o backfill so cria registros para pedidos que **nao tem** breakdown ainda, sem nunca sobrescrever dados existentes.

```typescript
// De:
.upsert(records, { onConflict: 'seller_id,order_id' });
// Para:
.upsert(records, { onConflict: 'seller_id,order_id', ignoreDuplicates: true });
```

#### Arquivo 2: `supabase/functions/ml-sync-real-costs/index.ts`

**Mudanca**: Na funcao `handleReset` (linha 144-163), remover o zeramento de `shipping_cost_seller` e `cost_shipping`. O reset so deve limpar campos de comissao/billing, nao frete que veio da API de envios.

```typescript
// Remover estas linhas do update:
shipping_cost_seller: 0,
cost_shipping: 0,
```

#### Arquivo 3: `supabase/functions/cost-engine/index.ts`

**Mudanca**: No upsert de breakdowns (linha 987-992), adicionar guarda de protecao: antes de gravar, se o novo `cost_shipping` for 0 mas o registro existente tiver valor > 0, preservar o valor existente. Isso funciona como rede de seguranca contra qualquer regressao futura.

Logica: buscar breakdowns existentes do batch antes do upsert, e para cada breakdown com `cost_shipping === 0`, verificar se o existente tem valor. Se sim, usar o valor existente.

### Resultado esperado

- Backfill noturno nunca mais sobrescreve dados de frete
- Reset manual nao apaga frete real
- Cost-engine preserva frete existente quando nao tem billing novo
- Os 1998 pedidos com "frete ausente" param de perder dados
- Job de calculo consegue prosseguir sem encontrar dados zerados

