

# Correção URGENTE: Migration do RPC não foi aplicada + chaves incompatíveis

## Diagnóstico

**Causa raiz**: A migration `20260409131518` que corrige o RPC `get_shipping_orders` **não foi aplicada no banco de dados**. O RPC rodando agora é a versão ANTIGA, sem:
- Filtro `today_dispatch` (por isso "Envios de hoje" mostra 0)
- Mapeamento de `ready_for_pickup`, `in_packing_list` → `pronta`
- Mapeamento de `buffered` → `aguardando_nf`
- Mapeamento de `in_hub` → `reimprimir`
- Correção da precedência `fulfillment` vs `delivered`

**Segundo problema**: A migration usa chaves **camelCase** (`totalCount`, `statusCounts`) mas o frontend espera **snake_case** (`total_count`, `status_counts`). Se a migration fosse aplicada do jeito que está, os contadores ficariam zerados.

**Evidência no banco**: Existem agora mesmo 49 pedidos cross_docking `ready_to_print` com `label_available=true` que deveriam aparecer como "Para imprimir", mas o RPC antigo os ignora por causa da ordem de precedência errada ou filtro de data incorreto.

## Correção

### 1. Recriar migration com chaves compatíveis com o frontend
Criar nova migration SQL com o RPC corrigido, usando **snake_case** nas chaves do JSON retornado (`total_count`, `status_counts`) para manter compatibilidade com o frontend existente (linhas 321-328 do `useShippingLabels.ts`).

A lógica do RPC será idêntica à da migration anterior que não foi aplicada, apenas corrigindo as chaves de retorno.

### 2. Nenhuma alteração de frontend necessária
O frontend já está correto — já envia `p_period_type: 'today_dispatch'` e já lê `result.total_count` / `result.status_counts`.

## Arquivo afetado
- **Nova migration SQL** — recriar `get_shipping_orders` com todas as correções + chaves snake_case

## Resultado
- Filtro "Envios de hoje" funciona por `estimated_handling_limit`
- Pedidos coleta (`ready_for_pickup`, `in_packing_list`) aparecem como "Para imprimir"
- Pedidos `buffered` aparecem como "Aguardando NF"
- Pedidos `printed` e `in_hub` aparecem como "Reimprimir"
- Contadores de status funcionam corretamente

