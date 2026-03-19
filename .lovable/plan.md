

## Diagnóstico: Por que sellers travam em 80%

### Causa raiz

O fluxo `/primeiro-acesso` tem 7 steps. O último é "Ativar ambiente" — que chama `updateOnboarding({ status: 'completed' })`. Porém, quando o seller conecta o ML no step 5, o OAuth redireciona para `/sincronizando` → depois vai para `/dashboard`. O seller **nunca volta** ao `/primeiro-acesso` para completar os steps 6 e 7.

Resultado: `onboarding_status` fica `'pending'` no banco, e o flag `onboarding_completed` fica `false`. O Speedometer mostra 80% eternamente.

Confirmação no banco:
- `delatripshop@gmail.com` → `onboarding_status: NULL` (nem row existe)
- `adeconex4@gmail.com` → `onboarding_status: NULL`
- Sellers com 100% → `onboarding_status: completed`

### Solução

Mover a conclusão do onboarding para o momento certo: **quando o seller volta do OAuth e os dados são sincronizados** (na página `/sincronizando`).

| Arquivo | Mudança |
|---|---|
| `src/pages/Sincronizando.tsx` | Após completar todos os sync steps, chamar `updateOnboarding({ status: 'completed' })` antes de redirecionar para o dashboard |
| `src/components/dashboard/ActivationSpeedometer.tsx` | Nenhuma mudança necessária — já lê o flag corretamente |

### Detalhe da mudança

No `Sincronizando.tsx`, após marcar `setAllDone(true)`:

1. Obter a sessão do usuário (já existe no código)
2. Chamar `supabase.rpc('update_onboarding_state', { p_status: 'completed', ... })`
3. Isso garante que ao chegar no dashboard, o flag já é `true` e o Speedometer mostra 100%

### Para os sellers existentes (DeLaTrip e ACS)

Na mesma implementação, vou adicionar uma migration SQL que corrige retroativamente: se o user tem `ml_accounts` vinculadas mas `onboarding_status` é NULL ou `pending`, atualizar para `completed`.

| Tipo | Ação |
|---|---|
| Migration SQL | `UPDATE/INSERT user_access_state` para users com ml_accounts mas sem onboarding completed |
| `Sincronizando.tsx` | Auto-completar onboarding quando sync finaliza |

### Resultado

- Sellers existentes: corrigidos via migration (100% imediato)
- Novos sellers: ao sair da tela de sync, onboarding já fica `completed` automaticamente
- Nenhum seller fica mais preso em 80%

