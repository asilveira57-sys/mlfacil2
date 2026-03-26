

## Plano: Corrigir sequência do onboarding após confirmação de e-mail

### Problema
Após confirmar o e-mail, o usuário vê a tela "Conectar conta do Mercado Livre" (step `connect`) em vez de começar pela tela de boas-vindas. Isso acontece porque o `localStorage` (`mktp_onboarding_v2`) guarda o estado de uma sessão anterior incompleta, e o `PrimeiroAcesso` carrega esse estado cegamente sem validar.

### Causa raiz
- `loadState()` (linha 29-35) lê do `localStorage` sem verificar se o progresso salvo é válido para a sessão atual
- Se o usuário abandonou o onboarding no passo "connect" e depois confirmou o e-mail, ao voltar ele cai direto no "connect" pulando welcome → name → company → plan

### Correção (2 arquivos)

**1. `src/pages/PrimeiroAcesso.tsx` — Validar estado do localStorage**

Na função `loadState()`, adicionar validação: se os dados obrigatórios do passo atual não existem, resetar para o início.

```text
Fluxo de validação:
  step == "connect" ou posterior?
    → userName vazio? → reset para "welcome"
    → companyName vazio? → reset para "company"
    → planChoice nulo? → reset para "plan"
```

Também adicionar: ao montar o componente, se `requiresOnboarding === true` e é a primeira visita (sem dados preenchidos), forçar step `"welcome"`.

**2. `src/pages/PrimeiroAcesso.tsx` — Race condition no redirect (linhas 85-93)**

Reforçar a proteção: só redirecionar para `/dashboard` se `state.step === "welcome"` (estado virgem). Em qualquer outro passo ativo, o usuário deve completar o fluxo explicitamente.

### Detalhes técnicos

Modificar `loadState()`:
```typescript
function loadState(): OnboardingState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Validar consistência: se está em passo avançado sem dados anteriores, resetar
      const step = parsed.step as OnboardingStep;
      const advancedSteps: OnboardingStep[] = ["connect", "importing", "done"];
      if (advancedSteps.includes(step)) {
        if (!parsed.userName?.trim() || !parsed.companyName?.trim() || !parsed.planChoice) {
          // Estado inconsistente — resetar
          localStorage.removeItem(STORAGE_KEY);
          return { step: "welcome", userName: "", companyName: "", companyId: null, planChoice: null };
        }
      }
      return parsed;
    }
  } catch {}
  return { step: "welcome", userName: "", companyName: "", companyId: null, planChoice: null };
}
```

Modificar redirect (linha 86-93): manter como está, já está correto (bloqueia redirect durante importing/done).

### Arquivos modificados

| Arquivo | Ação |
|---|---|
| `src/pages/PrimeiroAcesso.tsx` | Validar localStorage no `loadState()` |

### Resultado esperado
- Novo usuário confirma e-mail → vê tela "Bem-vindo ao MKTP Fácil" (step welcome)
- Fluxo linear: welcome → name → company → plan → connect → importing → done
- Sem pulos de etapa por estado stale do localStorage

