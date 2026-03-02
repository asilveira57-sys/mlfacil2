

# Plano: Módulo de Custos V2 -- Reestruturação Completa

## Escopo das Mudanças

Este é um projeto grande com 3 fases de execução. Vou dividir em etapas claras.

---

## FASE 1: Banco de Dados (Migrações)

### 1.1 Novas Tabelas

**`packaging_types`** -- Cadastro de embalagens por empresa
```sql
id uuid PK, company_id uuid NOT NULL FK, name text NOT NULL,
height_cm numeric, width_cm numeric, length_cm numeric,
cost_value numeric NOT NULL DEFAULT 0, is_active boolean DEFAULT true,
created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
-- Índice em company_id, RLS por company_id via is_company_member()
```

**`product_packaging_link`** -- Vínculo produto-embalagem
```sql
id uuid PK, company_id uuid NOT NULL, product_key text NOT NULL,
seller_id text NOT NULL, packaging_id uuid FK → packaging_types,
created_at timestamptz DEFAULT now()
-- Unique(seller_id, product_key), RLS por company_id
```

**`tax_configuration`** -- Impostos médios por empresa
```sql
id uuid PK, company_id uuid NOT NULL UNIQUE,
das_icms_percent numeric DEFAULT 0, pis_percent numeric DEFAULT 0,
cofins_percent numeric DEFAULT 0, irpj_percent numeric DEFAULT 0,
csll_percent numeric DEFAULT 0, difal_enabled boolean DEFAULT false,
difal_percent numeric DEFAULT 6, origin_state varchar(2),
created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
-- RLS por company_id
```

**`cost_calculation_logs`** -- Log de cada recalculação
```sql
id uuid PK, company_id uuid, seller_id text, order_id text,
receita numeric, custo_produto numeric, embalagem numeric,
imposto_percent_total numeric, imposto_valor numeric,
difal_enabled boolean, difal_applied boolean,
origin_state varchar(2), destination_state varchar(2),
lucro_final numeric, margem_final numeric,
created_at timestamptz DEFAULT now()
-- RLS por company_id
```

### 1.2 Remover tabela legado

- **Dropar `marketplace_fee_rules`** (taxa de venda legado)
- **Dropar `packaging_cost_settings`** (substituída por `packaging_types`)

### 1.3 Adicionar colunas em `order_cost_breakdown_cache`

- `cost_packaging_detail jsonb` (detalhamento por embalagem)
- `tax_percent_total numeric`
- `tax_value numeric`
- `difal_applied boolean DEFAULT false`
- `last_recalculated_at timestamptz`

---

## FASE 2: Backend (Edge Function cost-engine)

### 2.1 Remover código legado

- Remover `getSettings` / `updateSettings` (lê `marketplace_fee_rules` e `packaging_cost_settings`)
- Remover referências a `fee_mode`, `fee_percent_default`, `fee_fixed_default`
- Em `calculateSingleOrder`: remover lógica de taxa percentual legada (linhas 868-875)
- Em `calculateCosts`: remover leitura de `packaging_cost_settings`

### 2.2 Novos endpoints

| Endpoint | Ação |
|---|---|
| `packaging/list` | Listar embalagens por company_id |
| `packaging/upsert` | Criar/editar embalagem |
| `packaging/toggle` | Ativar/inativar |
| `packaging/link` | Vincular embalagem a produto |
| `tax/get` | Obter configuração de impostos |
| `tax/update` | Salvar configuração de impostos |

### 2.3 Nova função central: `calculateOrderProfit`

Fluxo completo:
1. Buscar receita bruta do pedido
2. Buscar comissão ML (billing real)
3. Buscar tarifa fixa (billing real)
4. Buscar frete ML (billing real)
5. Buscar custo do produto (`product_cost_catalog`)
6. Buscar embalagem vinculada (`product_packaging_link` → `packaging_types`)
   - Se múltiplos itens diferentes: somar embalagens
   - Se sem embalagem: embalagem = 0, registrar no log
7. Buscar `tax_configuration` da empresa
8. Calcular imposto:
   ```
   imposto_total_% = das_icms + pis + cofins + irpj + csll
   Se difal_enabled AND destino != origin_state: + difal_percent
   imposto_valor = receita * (imposto_total_% / 100)
   ```
9. Calcular lucro:
   ```
   lucro = receita - comissão - tarifa - frete - custo_produto - embalagem - imposto_valor
   margem = lucro / receita
   ```
10. Salvar em `order_cost_breakdown_cache`
11. Inserir log em `cost_calculation_logs`

### 2.4 `calculateSingleOrder` e `calculateCosts`

Refatorar ambas para chamar a nova `calculateOrderProfit` internamente, eliminando duplicação de lógica.

---

## FASE 3: Frontend (Componentes React)

### 3.1 Remover

- Card "Taxa de Venda (Legado)" de `CostSettings.tsx` (linhas 634-644)
- States `feePercent`, `feeMode` e referências a `marketplace_fee_rules`
- Lógica de save que grava em `marketplace_fee_rules`

### 3.2 `CostSettings.tsx` -- Novas abas

Substituir o card de embalagem simples e taxa legado por **2 abas**:

**Aba "Embalagens":**
- Tabela: Nome, Dimensões (AxLxC), Valor, Status (ativo/inativo)
- Botão "Nova Embalagem" → formulário inline ou modal
- Toggle ativar/inativar
- Sem limite de registros

**Aba "Impostos":**
- Campos editáveis: DAS/ICMS %, PIS %, COFINS %, IRPJ %, CSLL %
- Toggle "Aplicar DIFAL" + campo "% DIFAL" + "UF de Origem"
- Alerta: "DIFAL será aplicado apenas quando a venda for para outra UF."
- Botão salvar

### 3.3 `CostCatalog.tsx` -- Vincular embalagem

- Nova coluna "Embalagem" na tabela de anúncios
- Dropdown para selecionar embalagem padrão do produto
- Botão "Recalcular" individual

### 3.4 `CostOrders.tsx` -- Novas colunas

- Adicionar colunas: Embalagem, Impostos
- Manter: Receita, Comissão, Frete, Custo Produto, Lucro, Margem
- Botão "Recalcular" individual e em massa

### 3.5 Dashboard (aba Resumo)

- Adicionar: % Produtos A/B/C, Pedidos sem custo definido
- Os indicadores existentes (Faturamento, Custo Total, Lucro, Margem) já cobrem o pedido

---

## Detalhes Técnicos

```text
┌──────────────────┐     ┌───────────────────┐     ┌─────────────────────┐
│ packaging_types   │←────│product_packaging  │────→│ product_cost_catalog│
│ (por empresa)     │     │_link              │     │ (custo unitário)    │
└──────────────────┘     └───────────────────┘     └─────────────────────┘
                                                            │
┌──────────────────┐     ┌───────────────────┐              ▼
│ tax_configuration │────→│calculateOrderProfit│←────order_cost_breakdown
│ (por empresa)     │     │(função central)    │     _cache (resultado)
└──────────────────┘     └───────────────────┘              │
                                                            ▼
                                                  ┌─────────────────────┐
                                                  │cost_calculation_logs│
                                                  │(audit trail)        │
                                                  └─────────────────────┘
```

- Todas as consultas usam `fetchAllRows()` (sem limite de 1000)
- RLS em todas as novas tabelas via `is_company_member()`
- Logs obrigatórios em toda recalculação
- DIFAL: validação server-side com regra origin_state != destination_state
- Multiempresa: todo fluxo valida `company_id`

## Ordem de Execução

1. Migrações SQL (criar tabelas, dropar legado)
2. Atualizar edge function `cost-engine` (remover legado, novos endpoints, nova lógica central)
3. Atualizar `CostSettings.tsx` (abas Embalagens + Impostos)
4. Atualizar `CostCatalog.tsx` (vincular embalagem)
5. Atualizar `CostOrders.tsx` (novas colunas)
6. Atualizar Dashboard (indicadores ABC)

