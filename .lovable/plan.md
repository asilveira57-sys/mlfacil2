

# Correção: Etiquetas bloqueadas por inconsistência no controle de acesso

## Diagnóstico

O usuário ADECONEX (etiquetacapixaba2@gmail.com) está com trial expirado desde 27/03 na tabela `companies` e sem nenhum registro em `subscriptions`. Toda vez que tenta usar etiquetas, as edge functions chamam `check_ml_api_access`, que retorna 402 TRIAL_EXPIRED.

Há uma inconsistência de dados:
- `user_access_state`: `payment_status = active`, `trial_end_at = 2028` 
- `companies`: `trial_ends_at = 2026-03-27` (expirado), sem subscription

A função `check_ml_api_access` só consulta `companies` + `subscriptions`, ignorando `tenant_entitlements` (sistema novo de billing).

## Plano de Correção

### 1. Atualizar `check_ml_api_access` para consultar `tenant_entitlements`

Adicionar fallback na função SQL: após verificar `subscriptions` (tabela legada), também consultar `tenant_entitlements` com status ativo e período válido. Se encontrar entitlement ativo, liberar acesso.

```text
companies.trial → subscriptions → tenant_entitlements (fallback)
```

### 2. Corrigir dados inconsistentes do `user_access_state`

Atualizar o registro deste usuário para refletir a realidade (trial expirado, sem assinatura ativa).

### 3. Melhorar tratamento de erro no frontend

Garantir que quando o erro 402 ocorre em qualquer chamada de edge function no fluxo de etiquetas, a UI mostra uma mensagem clara com link para ativar plano em vez de tela branca.

## Detalhes Técnicos

**Migration SQL** — Recriar `check_ml_api_access`:
- Após o check de `subscriptions`, adicionar bloco que consulta `tenant_entitlements` via `tenant_members` (ou fallback direto por tenant_id = company_id)
- Se encontrar entitlement tier ativo com `current_period_end > now()`, retornar `allowed: true, reason: 'active_entitlement'`

**Migration SQL** — Fix dados:
- `UPDATE user_access_state SET trial_status = 'expired', payment_status = 'blocked' WHERE user_id = '433a4292-92c0-4ced-9c29-f1199f990d9a'`

**Frontend** — `useShippingLabels.ts`:
- O tratamento de TRIAL_EXPIRED já foi adicionado nas mensagens anteriores; verificar que cobre todos os pontos de chamada

## Resultado Esperado

- Usuários com `tenant_entitlements` ativo terão acesso mesmo sem registro na tabela legada `subscriptions`
- Usuários sem nenhum plano verão mensagem clara pedindo ativação
- Sem tela branca em nenhum cenário

