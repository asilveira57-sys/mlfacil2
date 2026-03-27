

## Plano: Corrigir reconhecimento de pagamento pelo sistema

### Diagnóstico

O pagamento do boleto foi processado com sucesso. Os dados confirmam:

- **`tenant_payments`**: registro existe, status `approved`, payment_id `150910495973`, valor R$ 49,90
- **`tenant_entitlements`**: entitlement `active` com `last_payment_id = 150910495973`, período até 2026-05-24
- **`user_access_state`**: `payment_status = 'trial'`, `trial_status = 'active'`, `trial_end_at = 2026-03-21` (expirado)
- **Webhook logs**: nenhum log encontrado — o webhook pode não ter sido invocado pelo Mercado Pago, ou foi invocado mas os logs expiraram

### Causa raiz

A função `rpc_activate_entitlement` cria o registro em `tenant_entitlements` corretamente, mas **não atualiza `user_access_state.payment_status`** de `trial` para `active`.

O sistema (`get_user_feature_flags`) lê **apenas `user_access_state`** para determinar acesso. Ele nunca consulta `tenant_entitlements`. Resultado: o entitlement existe mas o sistema ignora.

### Solução (2 partes)

---

**Parte 1 — Corrigir `rpc_activate_entitlement` (migração SQL)**

Adicionar ao final da função, antes do RETURN:

```sql
-- Atualizar user_access_state para todos os membros do tenant
UPDATE user_access_state 
SET payment_status = 'active',
    trial_status = 'expired',
    active_subscription_id = v_entitlement_id::text,
    updated_at = now()
WHERE user_id IN (
  SELECT user_id FROM tenant_members WHERE tenant_id = p_tenant_id
);

-- Fallback: se tenant_id é o próprio user_id (sem tenant_members)
UPDATE user_access_state
SET payment_status = 'active',
    trial_status = 'expired', 
    active_subscription_id = v_entitlement_id::text,
    updated_at = now()
WHERE user_id = p_tenant_id::uuid
  AND payment_status != 'active';
```

Isso garante que qualquer pagamento futuro atualize automaticamente o estado do usuário.

---

**Parte 2 — Corrigir o cliente Alex (dados atuais)**

Migração que corrige o registro atual:

```sql
UPDATE user_access_state
SET payment_status = 'active',
    trial_status = 'expired',
    active_subscription_id = '7bef07f2-da3f-4119-a79f-67a0ebb992e5',
    updated_at = now()
WHERE user_id = 'f984a017-5275-43ff-aeef-59fbb3be0e57';
```

---

**Parte 3 — Adicionar fallback em `get_user_feature_flags`**

Atualizar a função para que, se `payment_status` não é `active` mas existe um `tenant_entitlement` ativo, auto-corrija e considere como ativo:

```sql
-- Após obter v_state, verificar tenant_entitlements como fallback
IF v_state.payment_status != 'active' THEN
  PERFORM 1 FROM tenant_entitlements te
  JOIN tenant_members tm ON tm.tenant_id = te.tenant_id
  WHERE tm.user_id = p_user_id
    AND te.entitlement_type = 'tier'
    AND te.status = 'active'
    AND te.current_period_end > now();
  
  IF FOUND THEN
    UPDATE user_access_state 
    SET payment_status = 'active', trial_status = 'expired', updated_at = now()
    WHERE user_id = p_user_id;
    -- Reload state
    SELECT * INTO v_state FROM user_access_state WHERE user_id = p_user_id;
  END IF;
END IF;
```

---

### Arquivos modificados

| Arquivo | Ação |
|---|---|
| Nova migração SQL | Corrigir `rpc_activate_entitlement` + fix Alex + fallback em `get_user_feature_flags` |

### Resultado
- Pagamento do Alex reconhecido imediatamente
- Pagamentos futuros via webhook atualizam `user_access_state` automaticamente
- Fallback de auto-correção impede que entitlements válidos fiquem invisíveis

