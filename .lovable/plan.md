

# Plano: Incluir Add-ons (ZPL) na aba Módulos

## Diagnóstico

O `PlanModulesTab` lista apenas `tiers` (planos por volume de pedidos). O ZPL é um **add-on** (`addons` do `useBillingAdminTiers`), por isso não aparece na lista de seleção de planos para configurar módulos.

A tabela `plan_modules` já suporta qualquer UUID como `plan_id` — basta referenciá-lo. Não há mudança de banco necessária.

## Correção

### Arquivo: `src/components/admin/plans/PlanModulesTab.tsx`

1. Extrair `addons` além de `tiers` do hook `useBillingAdminTiers()`
2. Na tela de seleção de plano, adicionar uma seção "Add-ons" abaixo dos tiers, listando cada addon com nome, status e contagem de módulos
3. Ao clicar num addon, usar seu `id` como `selectedPlanId` — o editor de módulos funciona igual (mesma tabela `plan_modules`)
4. No header do editor, mostrar o nome do addon selecionado (fallback para `addons.find()` além de `tiers.find()`)

### Detalhes visuais

- Separador visual entre "Planos" e "Add-ons" (subheading "Add-ons" com ícone diferente, ex: `Puzzle`)
- Badge de módulos e status igual aos tiers
- Comportamento de salvar/carregar módulos idêntico

### Arquivos modificados
1. `src/components/admin/plans/PlanModulesTab.tsx` — incluir addons na listagem e no lookup do editor

