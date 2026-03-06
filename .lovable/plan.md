

## Diagnóstico e Plano: Separar funções de atualização + Guia de Logs de Auditoria

### Diagnóstico do Bug

Existem **duas funções diferentes** de atualização:

1. **Botão lateral direito (RotateCw individual)** → Chama `ml-sync-real-costs` com `resync_single`
   - Busca dados reais da API do ML (3 estratégias: orders API → billing cache → billing periods API)
   - Grava comissão e frete atualizados no `order_cost_breakdown_cache`

2. **"Atualizar selecionados" (batch)** → Chama `cost-engine/orders/bulk-reimport` com `job_type: 'resync'`
   - Executa `calculateSingleOrder` que **não busca dados da API do ML**
   - Usa apenas dados já no `meli_order_financials_cache` (fallback: `order_cost_breakdown_cache`)

**O bug**: Quando você atualiza individualmente via `ml-sync-real-costs`, os dados de comissão e frete ficam no `order_cost_breakdown_cache` (campos `fee_ml`, `shipping_cost_seller`). Depois, ao rodar batch com `calculateSingleOrder`, a função lê o `meli_order_financials_cache` — se estiver vazio, tenta fallback no `existingBreakdown`. **Porém**, o `calculateSingleOrder` sobrescreve o registro inteiro via upsert, e se o timing de leitura do existingBreakdown falhar (race condition entre leitura e escrita de outro pedido no batch), os valores voltam a zero.

Além disso, o `calculateSingleOrder` não preserva os campos `fee_ml` e `has_real_financial` que o `ml-sync-real-costs` gravou — ele calcula `commission_cost` mas não propaga `fee_ml`, potencialmente quebrando o fallback para pedidos seguintes.

### Plano de Correção

**1. Proteger `calculateSingleOrder` contra sobrescrita de zeros** (`cost-engine/index.ts`)
- Adicionar trava: se `existingBreakdown` já tem commission/shipping > 0 e o novo cálculo resulta em 0, preservar os valores existentes
- Adicionar campo `last_writer` (string) ao upsert para rastrear qual função gravou por último (`cost-engine:calculate`, `ml-sync-real-costs:resync_single`, `cost-engine:bulk-resync`, etc.)

**2. Adicionar coluna `last_writer` à tabela `order_cost_breakdown_cache`** (migration)
- `last_writer TEXT DEFAULT NULL` — registra a função que fez a última escrita
- Atualizar todos os pontos de escrita: `calculateSingleOrder`, `handleResyncSingle`, `reimportOrder`, batch jobs, nightly sync

**3. Criar aba "Logs de Gravação" no módulo de Custos** (`CostWriteLog.tsx`)
- Nova tab "Logs" nas configurações ou no diagnóstico
- Mostra as últimas N escritas no `order_cost_breakdown_cache` para o seller, exibindo:
  - `order_id`, `last_writer`, `calculated_at`, `commission_cost`, `shipping_cost_seller`, `fee_ml_source`
- Filtros: por pedido, por função escritora, por período
- Permite identificar rapidamente qual função zerou os dados

**4. Expandir `cost_calculation_logs` com campos financeiros** (migration)
- Adicionar: `comissao_ml NUMERIC`, `frete_seller NUMERIC`, `fee_ml_source TEXT`, `writer TEXT`
- Os logs passam a registrar quem gravou e com quais valores financeiros

### Resultado
- O batch "Atualizar selecionados" nunca mais vai zerar comissão/frete que já existem
- Cada gravação fica rastreável por `last_writer`
- A aba de Logs permite ao seller (e ao suporte) ver exatamente qual função escreveu por último em cada pedido

