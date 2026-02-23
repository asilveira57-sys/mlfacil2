

# Corrigir Hora de Corte e "Aguard. Envio" no Sandbox

## Problema 1: Hora de Corte incorreta (13:32 vs 13:30, 16:38 vs 16:14)

### Causa raiz
O sistema esta usando o `estimated_handling_limit` do **envio individual mais proximo** como hora de corte. Esse campo e calculado como `hora_criacao_pedido + horas_manuseio`, resultando em horarios com minutos "quebrados" (ex: 16:32:35 UTC = 13:32 BRT).

O Mercado Livre tem um horario de corte **fixo** por agencia/modalidade (ex: 13:30, 16:14) que e diferente do deadline por pedido. As APIs consultadas (`shipping_preferences` e `capacity_middleend/xd_drop_off`) nao retornam esse horario -- por isso o sistema faz fallback para o deadline do envio mais antigo.

### Solucao
Consultar o endpoint correto da API do ML que retorna o horario de corte real da agencia: `/shipments/handling_time/users/{user_id}` ou extrair o `estimated_handling_limit` mais restritivo de forma arredondada. A abordagem mais confiavel e usar o endpoint `/users/{user_id}/shipping_options` que retorna os prazos reais por modalidade.

Como alternativa imediata e pragmatica: arredondar o `estimated_handling_limit` para baixo ate o intervalo de 15 minutos mais proximo (ex: 13:32 vira 13:30, 16:38 vira 16:30). Porem isso ainda nao resolveria 16:38 -> 16:14.

A solucao definitiva e adicionar a consulta ao endpoint `/users/{ml_user_id}/shipping/handling_time` que retorna o cutoff real por tipo logistico.

### Alteracoes
**`supabase/functions/meli-shipping-cutoff-refresh/index.ts`**:
- Adicionar chamada ao endpoint `/users/{ml_user_id}/shipping/handling_time` (ou equivalente que retorne o cutoff fixo da agencia)
- Priorizar o horario retornado por esse endpoint sobre o `estimated_handling_limit` dos envios individuais
- Manter o fallback atual (deadline do envio mais antigo) apenas quando a API nao retornar dados

---

## Problema 2: "Aguard. envio" mostrando 484 e 5501 (numeros irreais)

### Causa raiz confirmada com dados
A query no `sandbox-snapshot-refresh` conta **TODOS os pedidos pagos de todos os tempos**:

```sql
-- Query ATUAL (errada)
SELECT count(*) FROM meli_orders_cache
WHERE seller_id = '...' AND order_status IN ('paid', 'handling')
-- Resultado: 484 para ADX SP, 5501 para Etiqueta Capixaba
```

Os dados reais de envios pendentes na `meli_shipments_cache` sao:
- ADX SP: 16 ready_to_ship + 4 pending = **20** (nao 484)
- Etiqueta Capixaba: 47 ready_to_ship + 29 pending = **76** (nao 5501)

### Solucao
Trocar a fonte de dados de `meli_orders_cache` para `meli_shipments_cache`, filtrando apenas envios com status ativo.

### Alteracoes
**`supabase/functions/sandbox-snapshot-refresh/index.ts`** (linhas 155-160):
```
-- ANTES (errado - conta todos os pedidos pagos historicos):
FROM meli_orders_cache WHERE order_status IN ('paid', 'handling')

-- DEPOIS (correto - conta apenas envios pendentes):
FROM meli_shipments_cache WHERE shipment_status IN ('ready_to_ship', 'handling', 'pending')
```

---

## Resumo das alteracoes

| Arquivo | Alteracao |
|---------|-----------|
| `sandbox-snapshot-refresh/index.ts` | Trocar query "aguard. envio" de `meli_orders_cache` para `meli_shipments_cache` |
| `meli-shipping-cutoff-refresh/index.ts` | Adicionar consulta ao endpoint ML de handling_time para obter cutoff real |

