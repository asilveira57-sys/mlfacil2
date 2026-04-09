

# Diagnóstico: Etiquetas não aparecem para imprimir

## Problemas encontrados

### 1. Filtro "Envios de hoje" não funciona
O RPC `get_shipping_orders` recebe o parâmetro `p_period_type = 'today_dispatch'` mas **ignora completamente** esse valor. Quando o filtro "Envios de hoje" é selecionado, o frontend envia `dateFrom: null, dateTo: null`, e o RPC retorna TODOS os pedidos sem filtro de data — nunca filtra por `estimated_handling_limit`. Por isso o sistema mostra "82 pedidos" quando deveria mostrar apenas os despachos de hoje.

### 2. Pedidos cross_docking com substatuses intermediários caem em "outros"
O RPC classifica o `final_status` assim:
- `pronta` → apenas se substatus = `ready_to_print` E `label_available = true`
- `aguardando_nf` → apenas se substatus = `invoice_pending`

Porém, pedidos cross_docking (coleta) vêm do ML com substatuses como `buffered`, `ready_for_pickup`, `in_packing_list`, `in_hub` — **nenhum deles é reconhecido**. Esses 27 pedidos caem em "outros" e somem da lista operacional.

### 3. `label_available` sempre `false` para cross_docking
No sync (`ml-sync-shipments`), a lógica em linha 105 faz:
```
labelAvailable = isPrintableSubstatus && !isFullLogistic
```
Mesmo que `FULL_LOGISTIC_TYPES` já não inclua `cross_docking`, o `isPrintableSubstatus` exige `ready_to_print` ou `printed`. Pedidos com substatus `ready_for_pickup` ou `in_packing_list` recebem `label_available = false`.

### 4. Dados de handling_limit ausentes
49 dos 56 envios ativos desse seller têm `estimated_handling_limit = NULL`, impossibilitando o filtro "Envios de hoje" mesmo que fosse implementado.

## Correções

### A. Atualizar RPC `get_shipping_orders` (Migration SQL)
1. **Adicionar filtro `today_dispatch`**: quando `p_period_type = 'today_dispatch'`, filtrar por `estimated_handling_limit` em vez de `created_at_meli`:
   - Mostrar pedidos com `estimated_handling_limit` hoje OU ontem (se ainda não enviados)
   - OU pedidos com handling_limit NULL que estejam em status ativo (`ready_to_ship`, `pending`, `handling`)
2. **Expandir mapeamento de `final_status`**: reconhecer substatuses intermediários de coleta como printáveis:
   - `ready_for_pickup` → `pronta` (etiqueta deve ser impressa antes da coleta)
   - `in_packing_list` → `pronta` 
   - `buffered` (pending) → `aguardando_nf` (aguardando processamento do ML)
   - `in_hub` → `reimprimir` (já em trânsito para hub)
3. **Corrigir ordem de precedência**: mover check de `fulfillment` para DEPOIS de `delivered/shipped/not_delivered`, evitando que pedidos Full já entregues apareçam como "Full" em vez de "Enviado"

### B. Atualizar sync `ml-sync-shipments` (Edge Function)
1. **Expandir `SELLER_PRINTABLE_SUBSTATUSES`**: incluir `ready_for_pickup`, `in_packing_list` além de `ready_to_print` e `printed`
2. Manter a lógica de excluir `fulfillment` de `label_available`

### C. Atualizar `useShippingLabels.ts` (Frontend)
1. Remover `cross_docking` de `FULL_LOGISTIC_TYPES` (linha 159) — já não deveria estar lá conforme correções anteriores, mas precisa confirmar
2. Atualizar `COMPLETED_SHIPMENT_STATUSES` se necessário

## Arquivos afetados
- **Migration SQL** — recriar RPC `get_shipping_orders` com filtro today_dispatch e mapeamento expandido
- **`supabase/functions/ml-sync-shipments/index.ts`** — expandir `SELLER_PRINTABLE_SUBSTATUSES`
- **`src/hooks/useShippingLabels.ts`** — confirmar remoção de `cross_docking` de FULL_LOGISTIC_TYPES

## Resultado
- "Envios de hoje" filtra corretamente por prazo de despacho
- Pedidos cross_docking (coleta) aparecem como "Para imprimir" quando etiqueta está disponível
- Seller vê os mesmos ~30-40 pedidos imprimíveis que o ML mostra

