

# Correção: Acesso bloqueado + UX de plano expirado

## Problema 1: Bug no `check_ml_api_access` (tenant_id errado)

A função SQL consulta `tenant_entitlements WHERE tenant_id = v_company.id` (o UUID da company), mas o entitlement do ADECONEX está registrado em `tenant_id = 'a1000001-...'` — que é o campo `companies.tenant_id`, não `companies.id`.

**Dados atuais:**
- `companies.id` = `bf1b9ced-...` 
- `companies.tenant_id` = `a1000001-...`
- `tenant_entitlements.tenant_id` = `a1000001-...` (ativo até 2028)

A query nunca encontra o entitlement porque compara IDs diferentes.

**Correção:** Alterar a query do fallback de entitlements para usar `v_company.tenant_id` (quando disponível) além de `v_company.id`:

```sql
WHERE te.tenant_id IN (v_company.id, v_company.tenant_id)
```

## Problema 2: UX — erro genérico em vez de tela de "renove seu plano"

Quando o trial expira, o frontend mostra um toast + o erro cai no error boundary (tela vermelha "Error"). Deveria mostrar uma tela informativa com botão para ir ao plano.

**Correção:**
- Na página `ShippingLabels.tsx`, verificar o estado de acesso ML via `useMlApiAccess()` (hook que já existe em `TrialExpiredBanner.tsx`)
- Se `isTrialExpired` for true, renderizar uma tela dedicada de "Plano expirado" com botão "Assinar plano" em vez de carregar toda a página de etiquetas
- Isso elimina a necessidade de sincronização e evita qualquer crash

## Plano de execução

### 1. Migration SQL — Corrigir `check_ml_api_access`
Recriar a função para que o bloco de fallback `tenant_entitlements` consulte tanto `v_company.id` quanto `v_company.tenant_id`:

```sql
WHERE te.tenant_id IN (v_company.id, COALESCE(v_company.tenant_id, v_company.id))
  AND te.status = 'active'
  AND te.current_period_end > now()
```

### 2. Frontend — Tela de plano expirado na ShippingLabels
No `ShippingLabels.tsx`, usar o hook `useMlApiAccess()` para verificar se o acesso está bloqueado. Se `isTrialExpired`, renderizar uma tela clara com:
- Ícone e título "Período de teste finalizado"
- Mensagem explicativa
- Botão "Ver planos" que navega para `/settings?section=plano`
- Sem carregar a tabela de pedidos ou tentar sincronizar

### 3. Tratamento global no edgeFunctionClient
Garantir que o `edgeFunctionClient.ts` ao receber TRIAL_EXPIRED não dispare erro que caia no error boundary — apenas retorne graciosamente.

## Resultado
- ADECONEX volta a funcionar imediatamente (entitlement encontrado)
- Qualquer usuário com trial expirado vê tela amigável em vez de erro
- Sem perda de funcionalidade existente

