

# Correção: Pedidos cross_docking não aparecem como "Para Imprimir"

## Diagnóstico confirmado

O problema é uma classificação errada do tipo logístico **cross_docking**. O sistema trata `cross_docking` como `fulfillment` (full), mas isso está incorreto:

- **Fulfillment**: ML armazena, embala e despacha. Vendedor NÃO imprime etiqueta.
- **Cross_docking**: Vendedor PRECISA imprimir etiqueta e levar ao ponto de coleta. ML só faz o transporte depois.

### Dados do GUI_GOODMAN agora:
- **8 pedidos** com `cross_docking` + `ready_to_print` → deveriam ser "Para Imprimir" mas estão como "Full"
- **0 pedidos** aparecem como "Para Imprimir" no sistema
- No Mercado Livre, esses mesmos pedidos aparecem em "Coleta | Amanhã" com "Etiquetas para imprimir"

### Causa raiz (4 arquivos + 1 RPC SQL)
Todos definem `FULL_LOGISTIC_TYPES = ['fulfillment', 'cross_docking']`, fazendo `label_available = false` para cross_docking e classificando como status `'full'`.

## Correção

### 1. Remover `cross_docking` de FULL_LOGISTIC_TYPES em 4 edge functions
- `supabase/functions/shipping-labels-sync/index.ts`
- `supabase/functions/ml-sync-shipments/index.ts`
- `supabase/functions/ml-backfill-shipments/index.ts`
- `supabase/functions/meli-shipping-cutoff-refresh/index.ts`

Mudar para: `FULL_LOGISTIC_TYPES = ['fulfillment']`

### 2. Corrigir RPC `get_shipping_orders` (migration SQL)
Na classificação `final_status`, mudar:
```sql
-- DE:
WHEN s.logistic_type IN ('fulfillment','cross_docking') ... THEN 'full'
-- PARA:
WHEN s.logistic_type = 'fulfillment' ... THEN 'full'
```

### 3. Corrigir dados existentes (migration SQL)
Atualizar todos os registros `cross_docking` com `ready_to_print`/`printed` para `label_available = true`:
```sql
UPDATE meli_shipments_cache
SET label_available = true
WHERE logistic_type = 'cross_docking'
  AND shipment_substatus IN ('ready_to_print', 'printed');
```

### 4. Re-deploy das edge functions
Deploy automático das 4 funções corrigidas.

## Arquivos afetados
- `supabase/functions/shipping-labels-sync/index.ts` — remover `cross_docking` de FULL
- `supabase/functions/ml-sync-shipments/index.ts` — idem
- `supabase/functions/ml-backfill-shipments/index.ts` — idem
- `supabase/functions/meli-shipping-cutoff-refresh/index.ts` — idem (para cutoff card)
- **Migration SQL** — corrigir RPC + dados existentes

## Resultado
- Os 8 pedidos cross_docking do GUI_GOODMAN passam a aparecer como "Para Imprimir"
- Pedidos de coleta (amanhã ou hoje) ficam visíveis e imprimíveis no sistema
- Fulfillment continua como "Full" (sem ação do vendedor)

