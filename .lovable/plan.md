

# Unificar Calculadora de Precificação (Frontend vs Backend)

## Problema atual
- **Frontend** (`/ferramentas/precificacao`): Calculadora completa (categoria, frete, variações) mas pede login para salvar — errado, é ambiente gratuito
- **Backend** (`/precificacao`): Calculadora simples com apenas 6 campos — deveria ser igual à do frontend, com salvamento habilitado

## Correções

### 1. Frontend — Remover opção de salvar, adicionar CTA de planos
**Arquivo:** `src/components/tools/pricing/PricingScenariosBlock.tsx`
- Remover o bloco de "Faça login para salvar" com botão "Entrar"
- Substituir por CTA suave: "Quer salvar e comparar simulações? Conheça nossos planos" com link para `/planos`
- Remover o botão "Salvar simulação atual" quando não autenticado
- Manter a calculadora completa funcionando normalmente sem login

**Arquivo:** `src/pages/tools/PricingSimulatorTool.tsx`
- Remover o bloco `PricingScenariosBlock` completamente do frontend (já que não faz sentido sem salvamento)
- Substituir por um card simples com CTA para planos

### 2. Backend — Substituir calculadora simples pela completa
**Arquivo:** `src/pages/Precificacao.tsx`
- Remover toda a implementação atual (calculadora simples de 6 campos)
- Importar e usar os mesmos componentes da ferramenta frontend: `PricingProductBlock`, `PricingLogisticsBlock`, `PricingCostsBlock`, `PricingResultsBlock`, `PricingVariationsBlock`, `PricingScenariosBlock`
- Usar o mesmo `calculateSimulation` e `SimulationInput` do `pricing-engine`
- Manter `PricingScenariosBlock` com salvamento habilitado (usuário já está logado)
- Manter dentro do `PageContainer` existente (layout do backend)

## Arquivos afetados
- `src/pages/tools/PricingSimulatorTool.tsx` — trocar cenários por CTA de planos
- `src/pages/Precificacao.tsx` — reescrever usando componentes completos + salvamento
- `src/components/tools/pricing/PricingScenariosBlock.tsx` — sem alteração (usado no backend)

## Resultado
- Visitante usa calculadora completa sem pressão para cadastro, vê CTA suave para planos
- Usuário logado tem a mesma calculadora completa + pode salvar, comparar e gerenciar cenários

