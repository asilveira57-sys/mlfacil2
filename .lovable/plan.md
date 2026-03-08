

## Diagnóstico: Por que comissão e frete estão zerados

### Problema encontrado

Analisei os dados reais do banco e encontrei a causa raiz. O sistema **não reconhece dois tipos de cobrança importantes** do Mercado Livre:

| Tipo de Cobrança (charge_type) | Registros | Valor Total (R$) | Status |
|---|---|---|---|
| `Custo por vender no Mercado Livre` | 1.760 | ✅ Reconhecido |
| `Custo por cobrar no Mercado Pago` | 1.760 | ✅ Reconhecido |
| **`Tarifa de venda`** | **1.746** | **R$ 44.290** | ❌ **NÃO RECONHECIDO** |
| **`Custo de gestão da venda`** | **1.744** | **R$ 44.290** | ❌ **NÃO RECONHECIDO** |

Ou seja: **~R$ 44 mil em taxas de venda são ignoradas** porque os padrões de matching não incluem "Tarifa de venda" nem "Custo de gestão da venda".

### Impacto nos dados

Para o seller `1411095727`:
- **3.302 pedidos** têm comissão correta (billing)
- **50 pedidos** estão marcados como billing mas com comissão zero (padrão não reconheceu)
- **1.848 pedidos** com frete zero (mesmo tendo dados de envio no billing)
- **1.032 pedidos** marcados como `no_charges` (possivelmente por falha no matching)

### Causa raiz técnica

Existem **3 locais diferentes** com lógica de matching de charge_type, e **nenhum é completo**:

1. **`processChargeType()`** (batch) — tem fallback para positivos desconhecidos, mas não lista "Tarifa de venda" explicitamente
2. **`handleResyncSingle()`** Strategy 2 — **SEM fallback**, padrões incompletos
3. **`handleReprocessPending()`** Strategy 2 — **SEM fallback**, mesmos padrões incompletos

### Plano de correção

**1. Criar função única `classifyBillingCharge()`** usada em todos os 3 locais, com os padrões completos:

```text
Comissão/Taxa de venda:
  - "custo por vender" ✓ (já existe)
  - "custo por cobrar" ✓ (já existe)
  - "tarifa de venda" ← NOVO
  - "custo de gestão" ← NOVO
  - "sale_fee" / "cargo por venta" ✓

Frete:
  - "tarifa de envio" ✓
  - "envio extra" / "envio intermunicipal" ✓
  - "envio interno" ← NOVO (28 registros)

Parcelamento:
  - "taxa de parcelamento" ✓
  - "installment" ✓

Estorno/Cancelamento:
  - "estorno" / "cancelamento" ✓
  - "bonificação" ✓

Storage/Ads (ignorar no cálculo de custo de venda):
  - "armazenamento" / "full" → categoria "storage"
  - "publicidade" / "ads" → categoria "ads"
```

**2. Substituir matching inline** nos 3 locais por chamada a `classifyBillingCharge()`

**3. Reprocessar pedidos afetados** — após o deploy, disparar `reprocess_pending` para corrigir os ~1.800 pedidos com comissão/frete zero

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `supabase/functions/ml-sync-real-costs/index.ts` | Criar `classifyBillingCharge()`, substituir matching inline em `processChargeType`, `handleResyncSingle` e `handleReprocessPending` |

### Resultado esperado

- Os ~1.800 pedidos com comissão zero serão recalculados com os valores corretos
- Novos pedidos serão classificados corretamente desde a primeira sincronização
- Uma única fonte de verdade para classificação de cobranças do ML

