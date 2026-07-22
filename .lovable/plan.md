## Problema

Colaboradores (ex.: Marlon, `adeconexexped@gmail.com`) não conseguem atualizar vendas. Apenas o titular consegue disparar a sincronização.

## Causa raiz confirmada

Toda edge function que fala com a API do Mercado Livre passa pelo gate `assertMlApiAccess` (`supabase/functions/_shared/ml-api-gate.ts`), que executa a RPC `check_ml_api_access(p_user_id)` usando o **user_id do chamador**.

A função SQL `check_ml_api_access` resolve plano/entitlement do usuário por três caminhos:

1. `company_users` → `companies`
2. `tenant_members` → `tenant_entitlements`
3. `user_access_state.payment_status`

Marlon (`auth_user_id = 7400e727-…`) não está em nenhum desses caminhos — ele existe apenas em `public.collaborators` com `created_by = 433a4292-…` (titular Alexandre / Deconex, que tem Veterano ativo até 2028). Portanto o gate devolve `403 ACCESS_DENIED`, `ml-sync-orders` (e as demais funções de sync) abortam antes mesmo de chegar em `resolveAccessibleMlAccount`, e nada é atualizado no `meli_orders_cache` — o que explica exatamente o sintoma: só as sincronizações disparadas pela conta titular aparecem.

Isso já foi corrigido no frontend (`useCanAccessModule` faz o "titular lookup" via `collaborators.created_by`), mas o mesmo raciocínio **não existe** no backend, então a chamada de sync morre no gate.

## Correção definitiva

### 1. Ensinar `check_ml_api_access` a herdar do titular (migration)

Adicionar, logo no início da função, uma etapa "STEP 0" que:

- Consulta `public.collaborators` filtrando por `auth_user_id = p_user_id AND status = 'active' AND deleted_at IS NULL`.
- Se encontrar linha ativa, substitui `p_user_id` pelo `created_by` correspondente (o titular) e segue a lógica atual normalmente.
- Anexa no JSON de retorno um campo informativo `inherited_from_collaborator: true` para telemetria (sem alterar o contrato `allowed/reason`).

Impacto: unifica a resolução com o frontend, cobre TODAS as edge functions que já usam o gate (sync-orders, sync-messages, sync-questions, shipping-labels-sync, radiography, ads, etc.) sem precisar tocar em cada uma.

### 2. Garantir que o `sellerId` do colaborador aponte para uma conta acessível

`RefreshNowButton` e `useOrdersSyncWatchdog` já enviam `seller_id` vindo de `useActiveAccount`. Como `resolveAccessibleMlAccount` já cobre o caso do titular, não é preciso mudar essas funções — o gate liberado é suficiente.

### 3. Validação

Após a migration:

- `SELECT public.check_ml_api_access('7400e727-0753-4952-bf89-84a3ac207f4e');` deve retornar `allowed: true` (herdado do titular Veterano).
- Logado como Marlon, clicar em "Atualizar agora" na tela de Vendas/Envios deve popular novas linhas em `meli_orders_cache` (verificável por `updated_at` recente no `sync_jobs` com `created_by_user_id = 7400e727…`).
- Titular continua funcionando exatamente como antes (Step 0 só age quando o caller é colaborador ativo).

## Fora de escopo

- Não vou mexer em `useCanAccessModule`, `useCollaboratorAccess`, guards de ZPL, políticas RLS ou tela de vendas — a inheritance frontend já cobre a UI.
- Não vou introduzir novas colunas/estruturas; a lógica é 100% dentro da função SQL.

## Detalhes técnicos

```text
check_ml_api_access(p_user_id)
├─ STEP 0 (novo)  resolve titular via collaborators.created_by
│    IF colaborador ativo → p_user_id := titular_user_id
├─ STEP 1  user_access_state (com p_user_id efetivo)
├─ STEP 2  companies via company_users / companies.user_id
├─ STEP 3  entitlements via tenant_members
└─ RETURN jsonb (+ inherited_from_collaborator quando aplicável)
```

Único artefato produzido:

- Uma migration `supabase/migrations/<timestamp>_ml_gate_collaborator_inheritance.sql` com `CREATE OR REPLACE FUNCTION public.check_ml_api_access(...)`.