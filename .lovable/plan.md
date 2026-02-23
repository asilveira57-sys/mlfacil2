
# Correcao Definitiva do Sandbox: Dados Desatualizados e Contagens Erradas

## Alteracao 1: sandbox-snapshot-refresh/index.ts (linhas 166-171)

Filtrar "Aguard. envio" apenas por substatuses acionaveis pelo vendedor:

```
ANTES:
.in("shipment_status", ["ready_to_ship", "handling", "pending"])

DEPOIS:
.eq("shipment_status", "ready_to_ship")
.in("shipment_substatus", ["ready_to_print", "invoice_pending", "ready_to_pack"])
```

Isso exclui envios ja no centro de distribuicao (dropped_off, in_hub, in_warehouse, buffered, packed, etc).

## Alteracao 2: operational-quick-sync/index.ts (linhas 192-201)

Remover o `if (changesFound > 0)` para que o snapshot seja atualizado em TODA execucao:

```
ANTES:
if (changesFound > 0) {
  await supabase.functions.invoke("sandbox-snapshot-refresh", ...);
}

DEPOIS:
await supabase.functions.invoke("sandbox-snapshot-refresh", ...);
```

Isso garante que quando etiquetas sao impressas/postadas, o sandbox reflete a mudanca no proximo ciclo de 30-45s.

## Resultado

- "Etiquetas" e "Aguard. envio" ficam sincronizados automaticamente a cada ciclo do Quick Sync
- Envios ja postados (dropped_off, in_hub, etc) nao aparecem mais como pendentes
