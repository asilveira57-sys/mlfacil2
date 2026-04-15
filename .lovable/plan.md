

# Desbloquear MEGATOOLSF — Fail-Open quando Cache Está Vazio

## Diagnóstico

O seller MEGATOOLSF (`seller_id: 127163577`) está com **zero registros** na `meli_orders_cache` — nenhum pedido de qualquer status, em qualquer data. Isso indica que a sincronização de pedidos nunca rodou para essa conta, não que ele não tem vendas.

A verificação de elegibilidade (`useShippingEligibility`) faz `COUNT(*) WHERE order_status = 'paid' AND last 30 days`, encontra 0, e bloqueia o acesso.

## Solução

Aplicar a política de fail-open já existente no projeto: se o cache total do seller está vazio (zero registros em qualquer status/data), considerar como "dados não sincronizados" e liberar o acesso.

## Alteração

**Arquivo:** `src/hooks/useShippingEligibility.ts`

Na `queryFn`, antes de declarar inelegível, verificar se o seller tem **algum** registro no cache. Se não tiver nenhum, é fail-open (cache não populado):

```typescript
// Após a query de 30 dias retornar 0...
if (sales30d === 0) {
  // Check if cache has ANY orders for this seller (any status, any date)
  const { count: totalCached } = await supabase
    .from('meli_orders_cache')
    .select('*', { count: 'exact', head: true })
    .eq('seller_id', sellerId);

  if ((totalCached ?? 0) === 0) {
    // Cache empty = sync never ran, fail-open
    return { eligible: true, reason: null, sales30d: 0 };
  }
}
```

Se o cache tem registros mas nenhum pago nos últimos 30 dias, aí sim bloqueia (comportamento atual).

## Impacto

- MEGATOOLSF: desbloqueado imediatamente
- Contas com cache populado: zero mudança
- Contas novas antes do primeiro sync: acesso liberado (correto)
- Segurança: mantida — contas com dados reais e sem vendas continuam bloqueadas

## Arquivo alterado
- `src/hooks/useShippingEligibility.ts` (uma verificação adicional)

