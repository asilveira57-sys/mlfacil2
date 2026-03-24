

# Plano — Corrigir redirecionamento pós-confirmação de email

## Diagnóstico

O seller confirma o email e cai direto no Dashboard (tela "Conectar Mercado Livre") em vez de `/primeiro-acesso`. Existem **dois problemas** concorrentes:

### Problema 1: Auth.tsx redireciona para /dashboard incondicionalmente
Em `Auth.tsx` (linha 131), o listener `onAuthStateChange` captura o evento `SIGNED_IN` após confirmação de email e redireciona para `/dashboard` sem verificar se o onboarding está pendente.

### Problema 2: ProtectedRoute depende de accessLoading
O `ProtectedRoute` deveria redirecionar para `/primeiro-acesso` quando `requiresOnboarding = true`, mas existe uma janela de tempo onde `accessLoading = true` e o componente mostra apenas o loader — se o Dashboard renderizar antes do access state resolver, o seller vê a tela de conexão.

## Correções

### 1. Auth.tsx — Redirecionar para /primeiro-acesso quando onboarding pendente
**Arquivo:** `src/pages/Auth.tsx`
- No `onAuthStateChange` (SIGNED_IN), em vez de ir direto para `/dashboard`, navegar para `/primeiro-acesso`.
- No `getSession` inicial (linha 122), mesma lógica: se já tem sessão, ir para `/primeiro-acesso` em vez de `/dashboard`.
- A página `/primeiro-acesso` já tem a lógica interna que verifica `requiresOnboarding` — se o onboarding já está completo, ela redireciona para `/dashboard` automaticamente (linhas 68-72). Portanto é seguro sempre redirecionar para `/primeiro-acesso` após login.

### 2. CriarAcesso.tsx — Mesma correção
**Arquivo:** `src/pages/CriarAcesso.tsx`
- Linha 33: trocar redirect de `/dashboard` para `/primeiro-acesso` quando sessão já existe.

### 3. PrimeiroAcesso.tsx — Garantir robustez
**Arquivo:** `src/pages/PrimeiroAcesso.tsx`
- Já redireciona para `/dashboard` quando onboarding completo (linhas 68-72) — nenhuma alteração necessária.

## Arquivos impactados
- `src/pages/Auth.tsx` (2 pontos: getSession redirect + onAuthStateChange)
- `src/pages/CriarAcesso.tsx` (1 ponto: getSession redirect)

## Validação
1. Seller confirma email → abre `/primeiro-acesso` → tela de boas-vindas.
2. Seller já com onboarding completo faz login → `/primeiro-acesso` → redireciona para `/dashboard` automaticamente.
3. Sem regressão no fluxo de login normal.

