

## Problema Identificado com Evidência Concreta

**Causa raiz**: Strategy 2 (billing_details_cache) está "fechando a porta" para Strategy 3 prematuramente.

Para o pedido `2000015220508868`:
- Strategy 1: `marketplace_fee` = 0 na API `/orders` → falha
- Strategy 2: `meli_billing_details_cache` tem **apenas 1 registro**: "Tarifa de envio extra ou intermunicipal" = R$ 56,90 (frete). **Não tem o registro de comissão** porque o cache de billing está truncado.
- Linhas 257-260: o código assume "tem registros de billing mas sem comissão → comissão é legitimamente 0" e marca `feeMLSource = "billing"`.
- Strategy 3 (`/billing_info` API) **nunca é chamada** porque `feeMLSource` já não é `"pending"`.

O print do ML mostra claramente R$ 75,16 de comissão (11,5%). O cache está incompleto.

## Correção

**Arquivo**: `supabase/functions/ml-sync-real-costs/index.ts`

### 1. `handleResyncSingle` (linhas 233-263)
**Remover** a lógica que assume "billing cache sem comissão = comissão é 0". Se Strategy 2 encontrar frete mas não comissão, NÃO marcar como `billing`. Manter `feeMLSource = "pending"` para que Strategy 3 (`/billing_info` API) seja chamada.

Mudança específica:
- Linhas 256-261: remover o bloco `else { feeMLSource = "billing"; }`. Se o cache tem registros mas feeML continua 0, manter `feeMLSource = "pending"` e deixar Strategy 3 buscar a comissão via API.
- Após Strategy 3, se `feeML` ainda for 0 mas tiver `shippingCostSeller > 0`, marcar como `"billing"` — porque nesse ponto todas as fontes foram consultadas.

### 2. `handleReprocessPending` (linhas 570-610)
Aplicar a mesma correção: remover a lógica que marca como "billing" quando o cache tem registros mas sem comissão. Permitir fallthrough para a chamada `/billing_info`.

### 3. Adicionar Strategy 3 no batch
Atualmente o batch (`handleReprocessPending`) só tem Strategy 1 e 2. Adicionar Strategy 3 (`/billing_info` API) idêntico ao do `resync_single`, para que o batch também consiga buscar comissão quando o cache está truncado.

### 4. Finalização robusta
Após todas as 3 estratégias: se `feeML` ainda é 0 mas existe `shippingCostSeller > 0`, marcar como `fee_ml_source = "billing"` com nota no `source_refs` indicando que todas as fontes foram consultadas. Isso evita o loop infinito sem assumir prematuramente que a comissão é 0.

