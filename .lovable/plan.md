

# Correção: Ativação travada em 80% para usuários em trial

## Diagnóstico

O usuário Magma (magmacomercio@hotmail.com) está com:
- `onboarding_status: completed` ✓
- `ml_account_connected: true` ✓
- `trial_status: active` ✓
- `payment_status: trial`
- `active_subscription_id: null`

O problema está na linha 52 do `ActivationSpeedometer.tsx`. O último passo ("Ativar módulos") exige **duas condições simultâneas**:
```
onboarding_completed AND has_active_subscription
```

`has_active_subscription` só é `true` quando há assinatura paga OU `payment_status = 'active'`. Usuários em **trial** têm `payment_status = 'trial'`, então essa flag é `false`. Resultado: o speedometer nunca chega a 100% durante o trial.

## Correção

### 1. Alterar lógica do passo "Ativar módulos" no `ActivationSpeedometer.tsx`

Substituir a condição do último passo para aceitar trial ativo OU assinatura ativa:

```
completed: (flags?.onboarding_completed ?? false) && 
           (flags?.has_active_subscription || flags?.trial_active)
```

Isso garante que qualquer usuário com acesso válido (trial ou pago) chegue a 100%.

### 2. Atualizar `has_active_subscription` no RPC `get_user_feature_flags`

Na função SQL, incluir `payment_status = 'trial' AND trial_end_at > now()` como condição válida para `has_active_subscription`:

```sql
'has_active_subscription', v_subscription IS NOT NULL 
  OR v_state.payment_status = 'active' 
  OR (v_state.payment_status = 'trial' AND v_effective_trial_end_at > now())
  OR COALESCE((v_api_access->>'allowed')::boolean, false)
```

Isso resolve globalmente — todos os componentes que checam `has_active_subscription` passam a reconhecer trial ativo como acesso válido.

## Resultado

- Usuários em trial com onboarding completo e ML conectado verão 100%
- O speedometer desaparece quando tudo está ativo (comportamento existente)
- Quando o trial expirar, `has_active_subscription` volta a false e o sistema mostra aviso de renovação

