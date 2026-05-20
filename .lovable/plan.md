# Acesso de Colaborador — Correções

Cliente de teste: `adeconex2@gmail.com` (colaborador da empresa titular).

## O que deve acontecer com um colaborador

1. **Nunca pode conectar conta Mercado Livre.** Todos os botões/CTAs de "Conectar Conta", "Nova Empresa" e "Conectar conta ML a esta empresa" precisam ficar ocultos no painel do colaborador.
2. **Herda a conexão (token) da conta titular** automaticamente, sem precisar fazer nada.
3. **Acesso aos módulos é limitado pelo Perfil de Acesso** atribuído pelo titular (já existe via `profile_permissions`).
4. **Não passa por Primeiro Acesso nem Boas-Vindas.** Ao entrar, vai direto para o Dashboard com a empresa do titular já ativa.

## Diagnóstico atual

- `useCollaboratorAccess` já identifica `isCollaborator` corretamente via `company_users` (não-owner) + `user_context.active_company_id`.
- `ActiveAccountContext` chama `activate_own_collaborator_invites` e prioriza a conta ML herdada (`isInherited`) da empresa ativa — a herança do token já funciona no backend (RPC `get_accessible_ml_accounts`).
- **Problema 1 (botões de conectar):** os componentes abaixo renderizam CTAs de conexão para qualquer usuário, inclusive colaborador:
  - `src/components/layout/AccountSwitcher.tsx` (botão "Conectar Conta" no header)
  - `src/components/settings/SettingsCompanies.tsx` (aba "Empresas e Contas" inteira: "Nova Empresa", "Conectar conta ML a esta empresa")
  - `src/components/dashboard/MLConnectionCard.tsx`, `MLNotConnectedBanner.tsx`, `DashboardOnboarding.tsx`, `ActivationSpeedometer.tsx` (cards/CTAs no Dashboard)
  - `src/components/access/AccountConnectionWarning.tsx` (warning genérico em várias páginas)
  - `src/pages/Promocoes.tsx`, `src/pages/Publicidade.tsx`, `src/pages/ShippingLabels.tsx`, `src/pages/financeiro/FinanceiroIntegracoes.tsx`, `src/pages/LabelHeaderSettings.tsx` (CTAs "Conectar Conta" embutidos)
  - `src/components/settings/SettingsLayout.tsx` (aba "Empresas / Contas" deve sumir para colaborador)
- **Problema 2 (Primeiro Acesso e Welcome):**
  - `ProtectedRoute` redireciona para `/primeiro-acesso` sempre que `requiresOnboarding=true`. Para colaborador isso não deve disparar: o colaborador não tem onboarding próprio; ele entra no contexto da empresa do titular.
  - `WelcomeOnboardingGate` mostra o modal de boas-vindas com base em `requiresOnboarding` da empresa — para colaborador, deve ser ignorado.

## Solução

### 1. Hook único de "é colaborador?"

Reaproveitar `useCollaboratorAccess().isCollaborator` (já estável). Onde precisar de checagem síncrona em locais sem React, usar um helper `isCollaboratorOfActiveCompany()` baseado em `company_users` + `user_context` (já temos a query).

Opcional: expor um booleano `isCollaborator` em `UserAccessContext` para que `ProtectedRoute`, `WelcomeOnboardingGate` e demais gates consumam sem refetch (uma única fonte).

### 2. Ocultar todos os CTAs de conexão para colaborador

Adicionar guarda `if (isCollaborator) return null;` (ou esconder o botão específico) em:

- `AccountSwitcher.tsx` → esconder botão "Conectar Conta" do header; manter o seletor de conta apenas em leitura.
- `SettingsLayout.tsx` → filtrar `empresas-contas` do array de abas quando `isCollaborator`. Se a URL cair em `?section=empresas-contas`, redirecionar para `?section=perfil`.
- `SettingsCompanies.tsx` → bloquear com estado "Você é colaborador desta empresa. Apenas o titular pode gerenciar contas Mercado Livre." (mensagem padronizada, sem botões).
- `MLConnectionCard.tsx`, `MLNotConnectedBanner.tsx`, `DashboardOnboarding.tsx`, `ActivationSpeedometer.tsx`, `AccountConnectionWarning.tsx` → não renderizar CTA de "Conectar"; mostrar estado informativo "Conexão gerenciada pelo titular".
- `Promocoes.tsx`, `Publicidade.tsx`, `ShippingLabels.tsx`, `FinanceiroIntegracoes.tsx`, `LabelHeaderSettings.tsx` → substituir botão "Conectar Conta" por mensagem informativa quando colaborador.

### 3. Pular Primeiro Acesso e Welcome para colaborador

- `ProtectedRoute.tsx`: se `isCollaborator`, ignorar `requiresOnboarding` e nunca redirecionar para `/primeiro-acesso`. Se ele entrar manualmente em `/primeiro-acesso`, redirecionar para `/` (Dashboard).
- `WelcomeOnboardingGate.tsx`: retornar `null` quando `isCollaborator`.
- `PrimeiroAcesso.tsx`: ao montar, se `isCollaborator`, redirecionar imediatamente para `/`.

Esses três pontos garantem o item 4 do pedido.

### 4. Garantia da herança (item 2)

A herança já existe via `get_accessible_ml_accounts` + `ActiveAccountContext`. Vou validar no teste com `adeconex2@gmail.com`:

- `company_users` da Interfood com `user_id = adeconex2`, `is_owner=false`, `status=active`, `profile_id` setado.
- `user_context.active_company_id` apontando para a empresa da Interfood (o `activate_own_collaborator_invites` faz isso no login).
- `ml_accounts` da Interfood com `company_id` igual à empresa.

Se algum desses pontos faltar no usuário de teste, ajusto via correção pontual no `activate_own_collaborator_invites` ou seed dos dados, sem alterar lógica geral.

## Detalhes técnicos

- Nenhuma migração de banco é necessária — RPCs e tabelas já suportam herança.
- Mudanças são todas em frontend (gating de UI + redirects de rota).
- Mantém compatibilidade com titular: titular continua vendo todos os CTAs.
- A aba **Perfis de Acesso** (criação de perfis) permanece visível só para titular/admin (já é hoje); a aba **Colaboradores** também.

## Arquivos a editar

```text
src/contexts/UserAccessContext.tsx              (expor isCollaborator)
src/components/auth/ProtectedRoute.tsx          (bypass onboarding p/ colab)
src/components/welcome/WelcomeOnboardingGate.tsx(retornar null p/ colab)
src/pages/PrimeiroAcesso.tsx                    (redirect p/ colab)
src/components/layout/AccountSwitcher.tsx       (esconder Conectar Conta)
src/components/settings/SettingsLayout.tsx      (filtrar aba empresas-contas)
src/components/settings/SettingsCompanies.tsx   (bloqueio com mensagem)
src/components/dashboard/MLConnectionCard.tsx
src/components/dashboard/MLNotConnectedBanner.tsx
src/components/dashboard/DashboardOnboarding.tsx
src/components/dashboard/ActivationSpeedometer.tsx
src/components/access/AccountConnectionWarning.tsx
src/pages/Promocoes.tsx
src/pages/Publicidade.tsx
src/pages/ShippingLabels.tsx
src/pages/financeiro/FinanceiroIntegracoes.tsx
src/pages/LabelHeaderSettings.tsx
```

## Validação com adeconex2@gmail.com

1. Login → cai direto no Dashboard (sem `/primeiro-acesso`, sem modal de boas-vindas).
2. Header não mostra "Conectar Conta"; seletor de contas mostra apenas a conta ML da Interfood.
3. `/settings` não exibe aba "Empresas / Contas".
4. Páginas Promoções, Publicidade, Etiquetas e Financeiro funcionam usando o token herdado da Interfood, sem CTA de conexão.
5. Módulos respeitam o Perfil de Acesso configurado pelo titular.
