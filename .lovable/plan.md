# Correção cirúrgica: "pagamento aprovado, plano não ativa"

## Diagnóstico (verificado em produção)

Verifiquei os 4 clientes dos seus prints e mais os 15 últimos pagamentos aprovados no banco:

| Cliente | Pagamento | DB: payment_status | DB: entitlement | Tier |
|---|---|---|---|---|
| naturallispinhal | 160191397948 (R$ 669,90) | active | active até 20/ago | 1.501–3.000 |
| rodrigojarussi | 159478683185 (R$ 149,90) | active | active até 21/jun | 701–1.500 |
| arpretiautopecas | 160132709894 (R$ 44,90) | active | active até 20/jun | 51–300 |
| mkmodas | 159834233904 (R$ 44,90) | active | active até 18/jun | Veterano |

**100% dos pagamentos aprovados nos últimos 30 dias têm entitlement ativo no banco.** O webhook do Mercado Pago, o `rpc_process_mp_payment` e a criação de `tenant_entitlements` estão funcionando.

## Causa raiz (frontend, não backend)

O hook `src/hooks/useUserAccessState.ts` só chama `get_user_status` em três momentos:

1. Primeiro mount
2. Evento `SIGNED_IN`
3. Quando alguém chama `refetch()` manualmente

Ele **ignora propositalmente** `TOKEN_REFRESHED` e mudanças de visibilidade para evitar cascata em troca de aba. E o `success_url` do checkout é `${origin}/auth?payment=success` — mas **nem `Auth.tsx` nem nenhum componente** trata esse query param.

Resultado: o cliente paga no Mercado Pago (que normalmente abre em nova aba/popup), volta para a aba do app que ainda tem o estado React anterior (`requires_payment=true`, `payment_status='trial'/'free'`), e continua vendo o paywall — mesmo com o entitlement já gravado. Ele clica em "pagar" de novo, recebe rejeição (cartão / antifraude por duplicidade), e abre suporte dizendo "todo pagamento dá erro".

Confirma com os próprios dados: o tenant `5cad373a` (naturallispinhal) tem **3 tentativas** de pagamento em sequência no mesmo dia — uma aprovada e duas rejeitadas logo depois (160191086340, 160191408292). Padrão clássico de re-tentativa após paywall não atualizar.

## Correção (cirúrgica, somente frontend)

### 1) `src/hooks/useUserAccessState.ts`
- Adicionar listener de `visibilitychange` + `focus` com throttling (≥ 8 s) para refetchar `get_user_status` quando o usuário volta para a aba do app vindo do MP.
- Adicionar listener do evento custom `billing:payment-success` que dispara `refetch()` imediato (sem throttle).
- Manter o `TOKEN_REFRESHED` ignorado para não regredir a memória de tab-switch cascade.

### 2) `src/pages/Auth.tsx`
- Ler `searchParams.get("payment")`. Se for `success`:
  - Disparar `window.dispatchEvent(new Event("billing:payment-success"))`.
  - Mostrar toast "Pagamento confirmado — ativando seu plano…".
  - Se já há sessão, redirecionar para `/` (a ProtectedRoute leva ao destino certo).
  - Se não há sessão, manter na tela de login com mensagem clara para fazer login para acessar o plano ativado.

### 3) `src/pages/Planos.tsx` (linha 95–97)
- No mesmo `useEffect` onde já trata `payment=success`, disparar também `billing:payment-success` e fazer `navigate("/", { replace: true })` após 1,5 s.

### 4) (opcional, hardening) `src/hooks/useTierOffers.ts` e `useTenantCheckout.ts`
- Trocar `success_url` de `/auth?payment=success` para `/?payment=success` quando o usuário **já estiver logado** no momento do checkout. Evita a parada na tela de Auth quando a sessão ainda existe.

## Fora de escopo (não mexer)

- Webhook `mercadopago-webhook` — funcionando.
- `rpc_process_mp_payment`, `rpc_activate_entitlement`, `rpc_renew_entitlement` — funcionando.
- `get_user_status` / `get_user_feature_flags` — funcionando (self-healing de payment_status já existe).
- Nenhuma migration de banco.

## Validação após o deploy

1. Logar como `naturallispinhal@gmail.com`, abrir DevTools, confirmar que `get_user_status` retorna `has_active_subscription: true` na primeira chamada (já hoje retorna).
2. Simular: deixar a aba em segundo plano por 1 minuto, voltar — observar nova chamada a `get_user_status` no Network.
3. Reproduzir o fluxo completo de checkout num tenant de teste — confirmar que ao retornar de `/auth?payment=success` o usuário cai no dashboard com plano ativo sem F5.
