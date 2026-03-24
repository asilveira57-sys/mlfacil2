
Diagnóstico confirmado (com evidência)

1) O redirecionamento de Auth/CriarAcesso já está correto para `/primeiro-acesso` (não é mais `/dashboard`).
2) O problema real está no backend: existe um trigger ativo `trg_auto_setup_new_user` (tabela `user_access_state`) que chama `handle_new_user_setup()` e força:
   - `onboarding_status = 'completed'`
   - `onboarding_completed_at = now()`
3) Isso “mata” a jornada antes de começar. Resultado:
   - `requires_onboarding = false`
   - `ProtectedRoute` libera `/dashboard`
   - seller cai direto no card “Conectar conta”.
4) Evidência no seller de teste: `adeconex4@gmail.com` foi criado com `onboarding_status=completed` no mesmo timestamp da criação (sem progresso real de onboarding).

Plano de correção definitiva

1) Corrigir a função de setup de novo usuário (migração)
- Atualizar `public.handle_new_user_setup()` para:
  - manter criação inicial da empresa (idempotente)
  - remover a atualização automática para `onboarding_status='completed'`
- Manter o trigger, mas sem “auto-completar onboarding”.

2) Ajuste de dados dos usuários já afetados
- Rodar backfill seguro para voltar a `pending` somente contas claramente auto-completadas indevidamente:
  - `onboarding_status='completed'`
  - `onboarding_completed_at` praticamente igual a `created_at`
  - sem progresso real de onboarding
  - sem conta ML conectada / sem plano selecionado
- Corrigir explicitamente o seller de teste atual (`adeconex4@gmail.com`) para garantir desbloqueio imediato dos testes.

3) Garantia de fluxo
- Não alterar rotas/lógica de frontend (já está correta).
- O fluxo passa a funcionar assim:
  - confirma email → entra/sessão inicia → vai para `/primeiro-acesso`
  - como `requires_onboarding=true`, mostra Boas-vindas (step 1)
  - só vai para dashboard após conclusão real do onboarding.

4) Validação de aceite (obrigatória)
- Cenário A (novo seller): cadastro + confirmação → abre Boas-vindas (não dashboard).
- Cenário B (seller já onboarded): login → dashboard normalmente.
- Cenário C (acesso direto em `/dashboard` com onboarding pendente): redireciona para `/primeiro-acesso`.
- Cenário D (seller de teste atual): após ajuste, consegue iniciar onboarding completo para testes.

Arquivos/objetos impactados

- Nova migração SQL:
  - redefine `public.handle_new_user_setup()`
  - backfill de `public.user_access_state` para casos afetados
- Objetos de banco afetados:
  - trigger `trg_auto_setup_new_user` (mantido)
  - função `handle_new_user_setup` (corrigida)
  - registros específicos em `user_access_state` (reparo)

Resultado esperado

- Onboarding de Boas-vindas volta a ser a porta de entrada real para novos sellers.
- Dashboard não sobrescreve mais a jornada inicial.
- Correção definitiva para novos cadastros + reparo dos usuários já contaminados pelo auto-complete indevido.
