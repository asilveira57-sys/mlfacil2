

## Plano de Correção — Módulo de Custos (5 problemas)

### Problema 1: Mensagem "~24h" → "24 a 48 horas"
**Arquivo:** `src/components/custos/CostSettings.tsx` (linhas 457 e 638)
- Alterar as duas ocorrências de "~24h" e "24h" para "24 a 48 horas"

---

### Problema 2: Parcelamento NÃO é custo do seller
**Causa confirmada no banco:** Pedido 2000015092686860 tem `installments_cost: 241.79` somado ao `cost_fees: 445.22` e `cost_total: 445.22`. O valor correto de custo é apenas R$203.43 (comissão).

A "Taxa de parcelamento (equivalente ao acréscimo no preço pago pelo comprador)" é paga pelo comprador. Não deve entrar no cálculo de custo do seller.

**Alterações:**

| Arquivo | Mudança |
|---|---|
| `supabase/functions/ml-sync-real-costs/index.ts` | Remover `installmentsCost` de `costFees` e `totalMarketplaceCost`. Manter o campo `installments_cost` salvo para exibição informativa, mas não incluir em `cost_fees`, `cost_total`, `profit_total` |
| `supabase/functions/cost-engine/index.ts` | Remover `installmentsCost` de `costFees` (linha 634) e de `costNet` (linha 648). Manter o campo salvo separadamente |
| `supabase/functions/costs-nightly-sync/index.ts` | Mesma correção: excluir installments de cost_fees |
| `src/components/custos/CostOrderDiagnostic.tsx` | Exibir "Parcelamento" com label "(pago pelo comprador)" e não incluir no "Total Custo Marketplace" |
| `src/components/custos/CostOrders.tsx` | Mesma mudança visual: marcar como informativo, não custo |

---

### Problema 3: Frete não carregado (R$28.45 faltando)
**Causa raiz investigada:** 
- A tabela `meli_order_financials_cache` está **vazia** (0 registros). O `cost-engine` depende dela para `cost_shipping_fee` mas não encontra dados.
- Na `meli_billing_details_cache`, o pedido 2000015092686860 tem apenas 3 entradas (comissão ML, comissão MP, parcelamento). **Não existe entrada de "Tarifa de envio"** para este pedido.
- A API `shipments/{id}/costs` retornou `sender.cost = 0` (fulfillment pode usar campo diferente).
- Outros pedidos do mesmo seller TÊM billing details de envio ("Tarifa de envio extra ou intermunicipal").

**Hipótese:** Para pedidos fulfillment, o ML pode faturar o envio em período posterior ou sob outro detail_sub_type. A entrada existe no painel do ML (R$28.45) mas não foi capturada pelo billing sync.

**Correção:**
1. No `ml-sync-real-costs`, ao chamar `/shipments/{id}/costs`, verificar campos alternativos: `d.senders?.[0]?.cost`, `d.receiver?.cost`, além de `d.sender?.cost`
2. Criar ação `resync_single` no `ml-sync-real-costs` que permite reprocessar UM pedido específico, buscando billing details via API e shipment costs, ignorando cooldown
3. No `cost-engine`, quando `meli_order_financials_cache` não tem dados, fazer fallback para `order_cost_breakdown_cache.shipping_cost_seller` (dados do sync-real-costs)

---

### Problema 4: Pedidos sem frete marcados como erro incorretamente
**Lógica atual:** `if (costShipping === 0 && order.shipment_id) missingFields.push('sem_frete_cobrado')` — marca TODO pedido com shipment e frete 0 como erro.

**Correção:** Distinguir entre:
- **Frete grátis real** (logistic_type = "fulfillment" com valor de frete abaixo de threshold, ou `free_shipping = true`) → status "ok", sem alerta
- **Frete realmente ausente** (pedido > 48h, tem shipment_id, valor do produto > R$79, sem billing de envio) → manter como erro/alerta
- Buscar `logistic_type` do `meli_shipments_cache` para determinar se frete é esperado

---

### Problema 5: Botão recalcular por pedido individual
**Novo recurso:** Na aba "Sem Custo" e no "Diagnóstico", adicionar botão "🔄 Recalcular" por linha/pedido que:
1. Chama `ml-sync-real-costs` com `action: "resync_single"` e `order_id`
2. Busca billing details atualizado via API do ML para aquele pedido
3. Busca shipment costs via API
4. Atualiza o `order_cost_breakdown_cache` com os novos dados
5. Recarrega a tela automaticamente

---

### Resumo de arquivos a editar

| Arquivo | Alterações |
|---|---|
| `src/components/custos/CostSettings.tsx` | Texto "24 a 48 horas" |
| `supabase/functions/ml-sync-real-costs/index.ts` | Excluir installments de cost; adicionar `resync_single`; verificar campos alternativos de shipping; usar logistic_type para sem_frete |
| `supabase/functions/cost-engine/index.ts` | Excluir installments de cost_fees/costNet; fallback shipping |
| `supabase/functions/costs-nightly-sync/index.ts` | Excluir installments de cost |
| `src/components/custos/CostOrderDiagnostic.tsx` | Label informativo no parcelamento; botão recalcular |
| `src/components/custos/CostOrders.tsx` | Label informativo no parcelamento |
| `src/components/custos/CostOrdersNoCost.tsx` | Botão recalcular por pedido; lógica de frete vs sem-frete |

