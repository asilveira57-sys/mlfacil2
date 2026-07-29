## Causa raiz (verificada no banco)

1. **O trial só nasce quando o cliente conecta o Mercado Livre.** A única chamada de `start_company_trial` está em `ml-oauth-callback` (`supabase/functions/ml-oauth-callback/index.ts`, RPC exposta como `n`). Nada dispara trial na criação da conta/empresa.
   - Lua Boutique (`nickstore.shopee@gmail.com`, empresa `Lua Boutique`, criada hoje 18:13): `companies.trial_started_at = NULL`, `trial_ends_at = NULL`, `user_access_state.trial_status = 'none'`, `payment_status = 'free'`, nenhuma conta ML.
   - Como ela quer usar só o **Conversor ZPL / Etiquetas Full** (que não depende de ML), ela nunca conectaria ML — e por isso nunca ganha o trial.

2. **O gate do ZPL ignora trial.** `src/components/access/ZplConverterAccessGuard.tsx` só olha `tenant_entitlements` (tier ou addon `zpl_full`). Trial não gera entitlement → cai em "Nenhum plano ativo". Isso contradiz `useCanAccessModule.ts`, que já libera tudo quando `trialActive`.

## Correção

### 1. Trial automático no cadastro (backend)
- Trigger `AFTER INSERT` em `public.companies` que, quando `trial_started_at IS NULL`, define `trial_started_at = now()` e `trial_ends_at = now() + 14 dias` (reaproveitando a lógica de `start_company_trial`, sem exigir ML).
- Manter `start_company_trial` idempotente: se já houver trial, não reinicia; o callback do ML continua funcionando sem duplicar.
- Sincronizar `user_access_state` (o `get_or_create_user_access_state` já deriva `trial_status` de `companies.trial_started_at`, então o estado passa a ficar `active` no primeiro acesso).

### 2. Backfill
- Ativar trial de 14 dias para Lua Boutique agora (empresa `f188dde5…`, tenant `3fdccfba…`) e para qualquer conta criada nos últimos 30 dias sem trial e sem plano pago.

### 3. Gate do ZPL passa a respeitar o trial (frontend)
- Em `ZplConverterAccessGuard.tsx`: se `trialActive` (via `useUserAccessState`), liberar `children` imediatamente, antes da consulta de entitlements.
- Estado `expired` continua mostrando "plano vencido"; `no_plan` só aparece para quem não tem trial nem entitlement.
- Mesma checagem no `ShippingEligibilityGuard` para etiquetas Full, garantindo que trial não caia em "sem vendas"/"sem plano".

### 4. Bloqueio só depois do trial
- Nenhuma mudança na regra de expiração: ao terminar os 14 dias, `trial_status = 'expired'` e o gate volta a exigir plano/addon — comportamento já existente.

## Detalhes técnicos
- Migração: função `public.auto_start_trial_on_company()` + trigger `trg_auto_start_trial` em `companies`; UPDATE de backfill.
- Frontend: dois arquivos de guard, sem alterações de layout.
- Validação: consultar `user_access_state` da Lua Boutique após o backfill (`trial_status = 'active'`, `trial_end_at` ≈ +14 dias) e conferir o carregamento de `/zpl-converter`.
