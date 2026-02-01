# Módulo de Precificação - Backend

## Visão Geral

O módulo de Precificação (Pricing Engine) permite criar, calcular e gerenciar simulações de preços com persistência, histórico e validações de margem.

## Tabelas do Banco de Dados

### `pricing_simulations`
Tabela principal de simulações.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID | Identificador único |
| workspace_id | UUID | Workspace associado |
| status | TEXT | DRAFT, SAVED, APPROVED, ARCHIVED |
| title | TEXT | Título da simulação |
| marketplace | TEXT | ML, SHOPEE, etc |
| sale_price | NUMERIC | Preço de venda |
| target_margin | NUMERIC | Margem alvo (opcional) |
| quantity | INTEGER | Quantidade |

### `pricing_simulation_inputs`
Snapshot dos parâmetros de cálculo.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| cost_product | NUMERIC | Custo do produto |
| cost_packaging | NUMERIC | Custo de embalagem |
| cost_extra | NUMERIC | Custos extras |
| weight_kg | NUMERIC | Peso em kg |
| shipping_cost_estimated | NUMERIC | Custo de frete estimado |
| fee_percent | NUMERIC | Taxa do marketplace (%) |
| fee_fixed | NUMERIC | Taxa fixa do marketplace |

### `pricing_simulation_results`
Resultados calculados com histórico.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| gross_revenue | NUMERIC | Receita bruta |
| net_revenue | NUMERIC | Receita líquida |
| profit_value | NUMERIC | Lucro por unidade |
| margin_percent | NUMERIC | Margem (%) |
| breakeven_price | NUMERIC | Preço de equilíbrio |
| flags | JSONB | Alertas/warnings |

### `pricing_validation_rules`
Regras de validação por workspace.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| scope | TEXT | GLOBAL, MARKETPLACE, CATEGORY |
| min_margin_percent | NUMERIC | Margem mínima obrigatória |
| warning_margin_percent | NUMERIC | Margem de alerta |
| allow_negative_margin | BOOLEAN | Permitir margem negativa |

### `pricing_simulation_events`
Auditoria/timeline de eventos.

## Edge Function: `pricing-engine`

### Endpoints

#### POST `/create`
Cria uma nova simulação.

```typescript
{
  workspace_id: string;
  sale_price: number;
  quantity?: number;
  marketplace?: string;
  target_margin?: number;
  inputs?: Partial<SimulationInput>;
}
```

#### POST `/recalculate`
Recalcula uma simulação existente.

```typescript
{
  simulation_id: string;
  sale_price?: number;
  quantity?: number;
  inputs?: Partial<SimulationInput>;
}
```

#### POST `/save`
Salva uma simulação (muda status para SAVED).

#### POST `/approve`
Aprova uma simulação (valida regras).

#### POST `/duplicate`
Duplica uma simulação.

#### POST `/archive`
Arquiva uma simulação.

#### GET `/list`
Lista simulações com filtros.

Query params: `workspace_id`, `status`, `marketplace`, `search`, `limit`, `offset`

#### GET `/details`
Detalhes completos com histórico.

Query params: `simulation_id`

#### POST `/validate`
Valida pricing sem persistir (cálculo rápido).

## Uso no Frontend

### Hooks

```typescript
import { 
  usePricingSimulations,
  usePricingSimulationDetails,
  usePricingOperations,
  useQuickPricing
} from '@/hooks/usePricingSimulation';

// Listar simulações
const { data, isLoading } = usePricingSimulations({ status: 'DRAFT' });

// Detalhes
const { data: details } = usePricingSimulationDetails(simulationId);

// Operações
const { create, recalculate, save, approve, duplicate, archive } = usePricingOperations();

// Criar simulação
await create.mutateAsync({
  sale_price: 100,
  inputs: { cost_product: 30, fee_percent: 16.5 }
});

// Cálculo rápido (sem persistir)
const { calculate, result, isCalculating } = useQuickPricing();
const result = await calculate({
  marketplace: 'ML',
  sale_price: 100,
  quantity: 1,
  inputs: { cost_product: 30 }
});
```

### Utilities

```typescript
import {
  getFlagLabel,
  getStatusLabel,
  getStatusColor,
  formatCurrency,
  formatPercent,
  getMarginColor,
  ML_FEE_PRESETS,
  LOGISTIC_TYPES,
  LISTING_TYPES
} from '@/lib/pricingEngineClient';
```

## Flags de Validação

| Flag | Descrição |
|------|-----------|
| `missing_cost` | Custo do produto não informado |
| `missing_dims` | Dimensões não informadas |
| `margin_negative` | Margem negativa |
| `shipping_out_of_table` | Frete fora da tabela |
| `shipping_manual_zero` | Frete manual zerado |

## Integração com Tabelas Existentes

O módulo reutiliza:
- `freight_rulesets` / `freight_rule_lines` - Tabela de frete
- `marketplace_fee_rules` - Regras de comissão
- `product_cost_catalog` - Custos de produtos
- `packaging_cost_settings` - Custos de embalagem
