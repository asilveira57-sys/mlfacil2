

## Mapa Atual do Onboarding — 3 Sistemas Sobrepostos

Existem **3 sistemas de onboarding** coexistindo no projeto. Aqui está o que cada um faz:

### 1. `/primeiro-acesso` — Tela principal de primeiro acesso (a que você pediu)
- **Rota:** `/primeiro-acesso`
- **Arquivo:** `src/pages/PrimeiroAcesso.tsx`
- **7 etapas:** Validar conta → Dados da empresa → Logomarca → Preferências → Conexão ML → Importação → Ativar ambiente
- **Tem barra de progresso lateral** com ícones e checklist (estilo velocímetro de ativação)
- **Funciona:** Usuário confirma e-mail → `ProtectedRoute` detecta `onboarding_status !== completed` → redireciona para `/primeiro-acesso`
- **Este é o fluxo correto que você quer manter**

### 2. `OnboardingWizard` — Modal antigo de boas-vindas (o que você quer remover)
- **Arquivo:** `src/components/onboarding/OnboardingWizard.tsx`
- **Renderizado globalmente** no `App.tsx` (linha 133)
- **7 passos em modal:** Welcome → Objetivo → Conectar ML → Regras ML → Impressão → Acesso → Completo
- **Conflito:** Aparece sobre qualquer página quando `requiresOnboarding === true`, competindo com o `/primeiro-acesso`

### 3. `WelcomeOnboardingGate` — Fluxo admin de boas-vindas por cards
- **Arquivo:** `src/components/welcome/WelcomeOnboardingGate.tsx`
- **Renderizado globalmente** no `App.tsx` (linha 134)
- **Busca fluxos configurados pelo admin** e exibe modal com steps dinâmicos
- **Já exclui** `/primeiro-acesso` da exibição

### 4. `ActivationSpeedometer` — Widget no Dashboard
- **Arquivo:** `src/components/dashboard/ActivationSpeedometer.tsx`
- **Exibido dentro do Dashboard** como card de progresso (5 etapas: conectar ML, importar vendas, etc.)
- **Este é o "velocímetro" que você mencionou** — ele está no Dashboard, não é uma tela separada

---

## O Problema

Quando o seller confirma o e-mail e entra, **dois sistemas competem**:
1. O `OnboardingWizard` (modal antigo) aparece por cima de tudo
2. O `ProtectedRoute` tenta redirecionar para `/primeiro-acesso`

O modal antigo bloqueia a experiência do `/primeiro-acesso`.

## Plano Proposto

1. **Remover o `OnboardingWizard` do `App.tsx`** — tirar a linha que renderiza o modal antigo globalmente
2. **Manter o `/primeiro-acesso`** como fluxo principal de onboarding (já funciona com as 7 etapas)
3. **Manter o `WelcomeOnboardingGate`** (fluxo admin) — ele já não interfere com `/primeiro-acesso`
4. **Manter o `ActivationSpeedometer`** no Dashboard — ele serve como lembrete pós-onboarding

Resultado: seller confirma e-mail → cai direto no `/primeiro-acesso` → completa os passos → vai pro Dashboard onde vê o velocímetro de ativação.

