
# Correcao Definitiva do Sandbox: Dados Desatualizados e Contagens Erradas

## Problemas Identificados (com dados reais do banco)

### Problema 1: "Aguard. envio" conta envios que o vendedor NAO precisa agir
A query atual conta TODOS os envios com status `ready_to_ship`, `handling`, `pending`, incluindo substatuses gerenciados pelo ML:

**ADX SP (seller 1411095727) — mostra 11, deveria ser 0:**
- `dropped_off` (3) — ja entregue na agencia
- `in_warehouse` (3) — no centro de distribuicao do ML
- `packed` (1) — empacotado pelo ML
- `buffered` (4) — aguardando processamento do ML

**Etiqueta Capixaba (seller 66043362) — mostra 76, deveria ser ~10:**
- `in_hub` (21) — no hub logistico ML
- `in_packing_list` (14) — na lista de empacotamento ML
- `buffered` (28) — aguardando processamento ML
- `invoice_pending` (9) — aguardando NF (unico acionavel)
- `in_warehouse` (1), `packed` (1), `ready_to_pack` (1), `manufacturing` (1)

**Correcao:** Filtrar "Aguard. envio" apenas por substatuses que exigem acao do vendedor: `ready_to_print`, `invoice_pending`, `ready_to_pack`.

### Problema 2: Snapshot fica obsoleto porque Quick Sync so atualiza quando detecta "mudancas"
O `operational-quick-sync` so chama `sandbox-snapshot-refresh` quando `changesFound > 0` (linha 193). Porem:
- O Quick Sync detecta "mudancas" como NF gerada ou etiqueta disponivel
- Quando um envio muda de `ready_to_print` para `dropped_off` (vendedor postou), o Quick Sync NAO detecta isso como mudanca
- Resultado: o snapshot continua mostrando "Etiquetas: 3" mesmo depois que foram todas impressas e postadas

**Correcao:** O Quick Sync deve SEMPRE atualizar os contadores operacionais do snapshot a cada ciclo (30s), independente de ter encontrado "mudancas" ou nao.

### Problema 3: "Etiquetas" mostra valor correto no momento do snapshot mas fica stale
O filtro `ready_to_print` esta correto, mas como o snapshot so se atualiza com refresh manual ou quando o Quick Sync encontra mudancas (que nunca encontra para transicoes de postagem), o valor fica congelado.

---

## Alteracoes Tecnicas

### Arquivo 1: `supabase/functions/sandbox-snapshot-refresh/index.ts`

Mudar a query de "Aguard. envio" para contar apenas substatuses acionaveis pelo vendedor:

```
-- ANTES (conta tudo, incluindo envios no centro de distribuicao):
FROM meli_shipments_cache
WHERE shipment_status IN ('ready_to_ship', 'handling', 'pending')

-- DEPOIS (conta apenas o que o vendedor precisa agir):
FROM meli_shipments_cache
WHERE shipment_status = 'ready_to_ship'
  AND shipment_substatus IN ('ready_to_print', 'invoice_pending', 'ready_to_pack')
```

### Arquivo 2: `supabase/functions/operational-quick-sync/index.ts`

Remover a condicao `if (changesFound > 0)` antes de chamar `sandbox-snapshot-refresh`. O snapshot deve ser atualizado em TODA execucao do Quick Sync para manter os contadores operacionais sincronizados:

```
-- ANTES (so atualiza quando encontra mudancas):
if (changesFound > 0) {
  await supabase.functions.invoke("sandbox-snapshot-refresh", ...);
}

-- DEPOIS (sempre atualiza os contadores):
await supabase.functions.invoke("sandbox-snapshot-refresh", ...);
```

---

## Resultado Esperado Apos Correcao

| Metrica | ADX SP (antes) | ADX SP (depois) | Etiqueta Capixaba (antes) | Etiqueta Capixaba (depois) |
|---------|---------------|-----------------|--------------------------|---------------------------|
| Etiquetas | 3 (stale) | 0 (atualizado a cada 30s) | 6 (stale) | 0 (atualizado a cada 30s) |
| Aguard. envio | 11 | 0 | 76 | ~10 (invoice_pending + ready_to_pack) |
