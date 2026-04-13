

## Diagnóstico

A tela branca em `/primeiro-acesso` acontece porque a página espera **indefinidamente** pelo carregamento do estado do usuário (`accessLoading`). O `ProtectedRoute` já tem um timeout de 6 segundos para esse cenário, mas a própria página `PrimeiroAcesso` não tem — ela fica travada no spinner para sempre se o RPC `get_user_status` demorar ou falhar.

A primeira imagem mostra o onboarding funcionando (step "name"). A segunda mostra a tela completamente branca — o que indica que o RPC travou ou falhou silenciosamente na tentativa seguinte, e a página nunca saiu do loading.

## Correção

**Arquivo: `src/pages/PrimeiroAcesso.tsx`**

1. Adicionar um timeout de 5 segundos no `accessLoading` — idêntico ao padrão já usado no `ProtectedRoute` e `ModuleAccessGuard`.
2. Se o timeout estourar, renderizar o onboarding normalmente (fail-open), já que RLS protege os dados no backend.
3. Isso garante que nenhum usuário fique preso em tela branca durante o onboarding, independente de lentidão ou erro no `get_user_status`.

Mudança específica na linha 350:
- Criar state `accessTimedOut` com `useState(false)`
- Adicionar `useEffect` que seta `accessTimedOut = true` após 5s se `accessLoading` continuar `true`
- Alterar a condição de loading para: `if (loading || (accessLoading && !accessTimedOut))`

Impacto: zero risco — a página de onboarding não depende de dados protegidos por RLS para funcionar; ela só usa `requiresOnboarding` para decidir se redireciona ao dashboard.

