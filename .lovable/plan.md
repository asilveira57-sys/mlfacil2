

## Diagnóstico dos Problemas

Existem **3 problemas sobrepostos** causando a experiência quebrada:

### Problema 1: `/primeiro-acesso` tem steps de conexão como placeholder
A página `/primeiro-acesso` (PrimeiroAcesso.tsx) tem os steps "Conexão com marketplace" e "Importação inicial" como **placeholders** — dizem "será disponibilizada em breve" e só têm botão de "Pular". Quando o seller conectou o ML por fora dessa tela, a conta ficou sem empresa associada.

### Problema 2: Welcome Cards exigem `companyId` para aparecer
O `WelcomeOnboardingGate` (linha 34) retorna `null` quando `companyId` ou `sellerId` são nulos. Novo usuário não tem empresa → cards não aparecem → usuário cai direto no dashboard sem contexto.

### Problema 3: Welcome Cards reaparecem após conclusão do onboarding
Depois que o seller conectou manualmente e voltou ao dashboard, os cards apareceram de novo porque o progresso do flow ainda não estava marcado como "completed" para aquele `companyId`.

---

## Plano de Correção

### 1. Remover redirecionamento para `/primeiro-acesso`
- **`ProtectedRoute.tsx`**: Remover a lógica que redireciona para `/primeiro-acesso` quando `requiresOnboarding === true`
- **`App.tsx`**: Manter a rota `/primeiro-acesso` acessível mas não como gate obrigatório
- Ao invés disso, o seller cai no Dashboard e os Welcome Cards aparecem como modal

### 2. Auto-criar empresa no signup
- Criar um **database trigger** que, ao inserir um novo usuário em `auth.users`, automaticamente cria um registro na tabela `companies` com `display_name` baseado no email
- Isso garante que `companyId` existe desde o primeiro login, permitindo os Welcome Cards funcionarem imediatamente

### 3. Marcar onboarding como "completed" automaticamente
- Quando a empresa é auto-criada, o `onboarding_status` no `user_access_state` deve ser marcado como `completed` para que o `ProtectedRoute` não bloqueie
- A experiência de boas-vindas fica 100% nos Welcome Cards (admin-managed), não no gate de onboarding

### 4. Adicionar step de conexão ML dentro dos Welcome Cards
- Criar um novo step do tipo `acao` no flow de boas-vindas existente (via admin ou migration) que contenha um botão CTA para iniciar a conexão ML
- O `WelcomeOnboardingModal` já suporta o tipo `acao` com `cta_label` e `cta_route` — basta configurar o step com `cta_route: '/settings'` (ou a rota de conexão ML)

### 5. Garantir que Welcome Cards não reapareçam
- O `useActiveOnboardingFlow` já verifica `status === 'completed' || status === 'skipped'` e pula flows concluídos
- Verificar que o `useCompleteOnboarding` está corretamente marcando o flow como completed

---

## Resumo das Alterações

| Arquivo | Mudança |
|---------|---------|
| `src/components/auth/ProtectedRoute.tsx` | Remover redirect para `/primeiro-acesso` |
| `src/hooks/useUserAccessState.ts` | Ajustar para não exigir onboarding gate |
| **Migration SQL** | Trigger para auto-criar empresa + marcar onboarding completed no signup |
| **Migration SQL** | Inserir step de "Conectar Mercado Livre" no flow de welcome cards |
| `src/components/welcome/WelcomeOnboardingGate.tsx` | Ajustar fallback quando `companyId` é null (buscar empresa do usuário) |

### Fluxo Final Esperado
```text
Email confirmado → Login → Dashboard carrega
  → Welcome Cards modal aparece (empresa já existe via trigger)
  → Step 1: Boas-vindas
  → Step N: "Conecte seu Mercado Livre" (CTA abre conexão)
  → Concluir → Dashboard alimentado
  → Welcome Cards NÃO reaparecem
```

