

## Plano: Eliminar Welcome Onboarding Gate + Corrigir fluxo pós-confirmação de e-mail

Dois problemas distintos:

---

### Problema 1: Sistema ainda chama fluxo de Welcome Cards (deletado no admin)

O `WelcomeOnboardingGate` está renderizado globalmente em `App.tsx` (linha 178). Se o fluxo foi excluído do banco, o hook `useActiveOnboardingFlow` retorna `null` e o gate não renderiza — mas o código continua fazendo queries desnecessárias e pode dar erro se as tabelas/dados forem removidos.

**Correção**: Eliminar completamente o `WelcomeOnboardingGate` do sistema:

| Arquivo | Ação |
|---|---|
| `src/App.tsx` | Remover import e uso de `<WelcomeOnboardingGate />` (linhas 18 e 178) |
| `src/components/welcome/WelcomeOnboardingGate.tsx` | Pode manter o arquivo (sem risco), mas o componente não será mais chamado |

Simples e cirúrgico — sem efeitos colaterais.

---

### Problema 2: Após confirmar e-mail, seller vai direto para ML sem criar empresa

**Fluxo atual**: `CriarAcesso.tsx` → confirma e-mail → `emailRedirectTo: /dashboard` → Dashboard → `MLConnectionCard` aparece direto → seller conecta ML → conta fica "órfã" (sem empresa vinculada).

**Fluxo correto**: Confirma e-mail → **`/primeiro-acesso`** (onde o step 2 é "Dados da empresa") → cria empresa → conecta ML → tudo vinculado.

**Correção**:

| Arquivo | Mudança |
|---|---|
| `src/pages/CriarAcesso.tsx` | Mudar `emailRedirectTo` de `/dashboard` para `/primeiro-acesso` (linha 64) |
| `src/pages/Dashboard.tsx` | No Dashboard, se `requiresOnboarding` for `true` E não há empresa criada, redirecionar para `/primeiro-acesso` em vez de mostrar o `MLConnectionCard` direto |
| `src/components/auth/ProtectedRoute.tsx` | Adicionar redirect para `/primeiro-acesso` quando `requiresOnboarding === true` e a rota atual não é `/primeiro-acesso` nem `/sincronizando` |

Dessa forma, o seller sempre passa pelo `/primeiro-acesso` (que já tem o step de criar empresa no step 2) antes de poder conectar o ML.

---

### Resultado esperado

- Nenhuma tela de "Welcome Cards" modal aparece mais em nenhuma circunstância
- Novo seller: confirma e-mail → vai para `/primeiro-acesso` → cria empresa → conecta ML → empresa já fica vinculada
- Seller existente que já completou onboarding: não é afetado (vai direto para dashboard)

