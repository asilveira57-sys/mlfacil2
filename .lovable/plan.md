## Contexto

Colaborador **Marlon** (`adeconexexped@gmail.com`, auth_user_id `7400e...`) do titular ADECONEX (`433a4...`).
Diagnóstico após inspeção do banco:

1. **"Etiqueta Full precisa de plano"** — Marlon tem `profile_permissions.view = true` para `marketplace.sales.etiqueta_full`, e `Etiquetas de Envio` funciona. O hook `useCanAccessModule` usa **o `user_id` do colaborador** para resolver o plano; como Marlon não é `tenant_member` do tenant pago do titular, o resolvedor cai em caminhos incorretos (ex.: `selected_plan_id` legado de onboarding do próprio Marlon com grupo `zpl`) e bloqueia módulos que não estão em `plan_modules` do ZPL. O titular tem entitlement ativo no tenant `a1000001-...` que **não é herdado** pelo colaborador.

2. **Só aparece 1 conta ML (ADECONEX)** — o titular tem 5 contas ML (`ADECONEX`, `ADECONEX.SP`, `ADECONEXVV`, `ADX LOJA`, `MLFACIL_CONSULTORIA`), cada uma com **`company_id` diferente**. Marlon tem 1 linha em `company_users` (company_id da ADECONEX). A função `get_accessible_ml_accounts` filtra contas herdadas por `ma.company_id = ac.member_company_id`, então só a ADECONEX passa.

3. **Demora para receber etiqueta após ML emitir NF** — o post-login prefetch e o auto-sync de shipping-labels usam apenas a conta ativa do usuário logado. Para colaboradores, `active_marketplace_account_id` fica preso em 1 conta, e as demais contas herdadas ficam sem sync frequente (só via jobs globais do titular).

## Correções

### 1. Colaborador herda plano do titular em `useCanAccessModule`
- Antes de resolver por `tenant_members`/`user_plan_assignments`/`user_access_state`, checar `collaborators` (auth_user_id = user, status = active) e, se for colaborador, resolver o plano usando o **`created_by` (titular)**:
  - buscar `tenant_members.tenant_id` do titular → `tenant_entitlements` ativo (regra Veterano > ZPL já vigente);
  - só cair em `selected_plan_id` do próprio Marlon como último recurso.
- Efeito: colaborador enxerga exatamente os mesmos `plan_modules` do titular; se o titular tem plano Full/Veterano, `etiqueta_full` deixa de ser bloqueado.
- Aplica a **todos os colaboradores** (regra geral, não só Marlon).

### 2. Colaborador vê todas as contas ML do titular
- Alterar `get_accessible_ml_accounts` (função SQL) via migration para que colaboradores herdem **todas** as `ml_accounts` do `created_by`, independente do `company_id`:
  - manter `ma.user_id = ac.created_by`;
  - remover o filtro `ma.company_id = ac.member_company_id` na CTE `inherited_accounts` (ou torná-lo apenas ordenação, para priorizar a conta do company_id do colaborador);
  - preservar filtros de `is_connected` e `connection_status`.
- Efeito: Marlon passa a ver ADECONEX, ADECONEX.SP, ADECONEXVV, ADX LOJA, MLFACIL_CONSULTORIA no AccountSwitcher; vale para todos os colaboradores existentes.

### 3. Reduzir latência da etiqueta após emissão de NF pelo ML
- Ao trocar de conta no `AccountSwitcher` (ou entrar como colaborador), disparar `shipping-labels-sync` para a **conta selecionada** imediatamente (respeitando janela 07‑17 BRT / bypass manual), não só para a conta ativa antiga.
- No `usePostLoginPrefetch`: para colaboradores, iterar sobre **todas as contas herdadas** retornadas por `get_accessible_ml_accounts` (limitando concorrência) e enfileirar sync de shipping-labels em cada uma.
- Garantir que webhook `ml-webhook-ingest` de shipments faz upsert em `meli_shipments_cache` para todos os `ml_user_id` do titular, independente de quem está logado (já é hoje, apenas validar que colaborador consegue LER via RLS após correção nº 1).
- Se webhook estiver atrasado, o botão de refresh manual do módulo Etiquetas passa a valer também para o colaborador (não bloqueado por plano após correção nº 1).

## Arquivos afetados

- `src/hooks/useCanAccessModule.ts` — inheritance de plano do titular.
- Migration nova em `supabase/migrations/` — recriar `public.get_accessible_ml_accounts` sem o filtro por `company_id` para herdados.
- `src/hooks/usePostLoginPrefetch.ts` — iterar contas herdadas em colaboradores.
- `src/contexts/ActiveAccountContext.tsx` (ou equivalente do switcher) — disparar sync ao trocar conta.

## Validação

- Rodar SQL de verificação com o `auth.uid()` de Marlon simulado, confirmando 5 contas retornadas.
- Confirmar via preview que Marlon:
  - Vê as 5 contas no switcher.
  - Acessa `/zpl-converter` na aba Etiqueta Full sem tela de "precisa de plano".
  - Ao trocar de conta ML, dispara sync e a lista de etiquetas atualiza sem atraso.
- Repetir para outro colaborador de outro titular para garantir generalização.

## Notas

- Nenhuma mudança em módulos de negócio além do necessário: fix é 100% em access-control e sync.
- Regra Veterano > ZPL continua respeitada (herança usa entitlements ativos do titular, já ordenados por essa política).
