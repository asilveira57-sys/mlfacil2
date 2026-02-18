
# Correcao: Sincronizacao de Status e Background Cron

## Problemas Identificados

### 1. Botao "Atualizar" nao atualiza status existentes
O sync pipeline (fase 3-4) so busca envios **faltantes** (`missingShipmentIds`). Se um envio ja existe no cache com status `invoice_pending`, ele nunca e re-consultado na API do ML para verificar se ja mudou para `shipped` ou `delivered`.

### 2. Cron `shipping-status-sync` nunca executa
A funcao NAO esta configurada com `verify_jwt = false` no `config.toml`. O cron envia o anon key como Bearer token, mas a verificacao JWT rejeita a requisicao antes de chegar ao codigo da funcao. Resultado: `last_run_at` e `null` desde a criacao.

### 3. `estimated_handling_limit` nunca foi preenchido
Com o cron parado e o sync manual so buscando envios novos, nenhum envio existente foi atualizado com o campo `estimated_handling_limit`. Resultado: "Envios de hoje" mostra 0 registros.

### 4. RPC duplicada (limpeza)
Existem 2 versoes da RPC `get_shipping_orders` (9 e 10 parametros). A versao antiga (sem `p_period_type`) tem logica incorreta. Precisa ser removida.

## Plano de Correcao

### Etapa 1: Corrigir config.toml
Adicionar `verify_jwt = false` para `shipping-status-sync` no `supabase/config.toml`.

### Etapa 2: Corrigir o sync manual para atualizar status existentes
No `useShippingLabels.ts`, apos sincronizar envios faltantes, adicionar uma fase que re-sincroniza envios com **status ativos** (`ready_to_ship`, `handling`, `pending`) -- esses sao os que podem ter mudado de status no ML.

Logica:
- Buscar do cache local todos os `shipment_id` onde `shipment_status IN ('ready_to_ship','handling','pending')`
- Enviar para `ml-sync-shipments` (que ja faz upsert, atualizando status existentes)
- Isso garante que ao clicar "Atualizar", envios que ja foram despachados/entregues sejam corrigidos

### Etapa 3: Remover RPC antiga (9 params)
Migration SQL para dropar a versao antiga de `get_shipping_orders` sem `p_period_type`.

### Etapa 4: Re-deploy `shipping-status-sync`
Apos corrigir o config.toml, fazer deploy da funcao para que o cron funcione.

## Arquivos Modificados

| Arquivo | Mudanca |
|---------|---------|
| `supabase/config.toml` | Adicionar `verify_jwt = false` para `shipping-status-sync` |
| `src/hooks/useShippingLabels.ts` | Adicionar fase de re-sync de envios ativos apos fase de envios faltantes |
| Migration SQL | Dropar overload antiga de `get_shipping_orders` (9 params) |

## Impacto Esperado

- O cron de 10 minutos vai finalmente executar, atualizando status e `estimated_handling_limit` em background
- O botao "Atualizar" vai re-consultar envios ativos na API do ML, corrigindo status desatualizados
- "Envios de hoje" vai comecar a funcionar conforme `estimated_handling_limit` for preenchido
- Nenhum reload de tela -- tudo roda em background
