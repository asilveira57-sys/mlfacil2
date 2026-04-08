
Objetivo: corrigir de forma estrutural o caso do usuário pago continuar vendo “precisa contratar um plano” e garantir que os próximos usuários ativem corretamente sem depender de sorte ou de caminhos diferentes.

Diagnóstico confirmado
- O problema não é só UI. Há divergência entre as fontes de verdade de acesso.
- O histórico de faturamento já lê `tenant_entitlements`, por isso o plano aparece como ativo em Configurações.
- Já o bloqueio de acesso e partes do dashboard dependem de flags calculadas por RPCs que ainda misturam modelos antigos e novos:
  - alguns trechos buscam empresa por `companies.user_id`
  - outros por `company_users`
  - alguns validam entitlement via `tenant_members`
  - outros via `company.id` / `company.tenant_id`
  - outros ainda checam `subscriptions.user_id`
- Resultado: o usuário pode ter pagamento e entitlement válidos, mas a flag `trial_expired/requires_payment` continua vindo errada em certos cenários.

O que corrigir
1. Unificar a regra de acesso no backend
- Reescrever a lógica de `get_user_feature_flags` para usar uma única resolução de contexto:
  - localizar a empresa ativa do usuário via `company_users` com fallback seguro
  - localizar entitlement ativo via `tenant_entitlements` usando ambos `company.id` e `company.tenant_id`
  - considerar assinatura antiga apenas como fallback, nunca como fonte principal
- Regra final:
  - se existir entitlement ativo e dentro do período, então:
    - `has_active_subscription = true`
    - `requires_payment = false`
    - `trial_expired = false`
    - recursos liberados conforme plano
- Isso precisa virar a regra única para todos os usuários novos e antigos.

2. Sincronizar o estado derivado do usuário
- Ajustar `rpc_activate_entitlement` / renovação para continuar sincronizando `user_access_state`, mas sem depender só de `tenant_members`.
- Ao ativar um plano:
  - atualizar `payment_status = 'active'`
  - encerrar trial no estado derivado
  - refletir o vínculo para o(s) usuário(s) da empresa/tenant correta
- Adicionar fallback para casos em que o usuário esteja ligado à empresa por `company_users`, não apenas por `tenant_members`.

3. Eliminar caminhos antigos que reclassificam o usuário como bloqueado
- Revisar `check_ml_api_access` para garantir que entitlement ativo sempre tenha precedência sobre trial expirado.
- Garantir que o retorno `TRIAL_EXPIRED` só aconteça quando realmente não houver:
  - entitlement ativo
  - assinatura ativa legada
  - período manual válido
- Isso evita o banner amarelo no dashboard e o bloqueio indevido.

4. Alinhar frontend para não depender de interpretações paralelas
- Manter o frontend lendo apenas as flags unificadas.
- Revisar especialmente:
  - `SalesDashboard.tsx`
  - `AccessGate.tsx`
  - `TrialExpiredPaywall.tsx`
  - `ActivationSpeedometer.tsx`
  - `SettingsSubscription.tsx`
- Objetivo: nenhuma tela deve inferir “precisa de plano” por heurística própria se `has_active_subscription` vier verdadeiro.

5. Corrigir o caso atual e prevenir reincidência
- Criar migration de saneamento para sincronizar `user_access_state` de usuários com entitlement ativo já existente.
- Esse backfill deve:
  - localizar usuários vinculados à empresa/tenant correta
  - marcar `payment_status = 'active'`
  - expirar o trial derivado quando houver plano pago ativo
- Assim o usuário atual é corrigido e os já pagos que entraram antes também.

6. Validação final obrigatória
- Validar com um usuário pago real que hoje está com erro:
  - Configurações mostra plano ativo
  - dashboard não mostra mais “Ative um plano”
  - `ActivationSpeedometer` fecha em 100% quando onboarding estiver concluído
  - paywall/modal/banner não aparecem
- Validar também usuário novo:
  - pagou → webhook cria entitlement
  - flags mudam para ativo
  - dashboard abre sem mensagem de trial expirado
  - histórico e acesso ficam consistentes

Arquivos e áreas a revisar
- Backend SQL:
  - `supabase/migrations/...get_user_feature_flags...`
  - `supabase/migrations/...check_ml_api_access...`
  - `supabase/migrations/...rpc_activate_entitlement...`
  - `supabase/migrations/...rpc_renew_entitlement...`
- Frontend:
  - `src/components/SalesDashboard.tsx`
  - `src/components/access/AccessGate.tsx`
  - `src/components/access/TrialExpiredPaywall.tsx`
  - `src/components/dashboard/ActivationSpeedometer.tsx`
  - `src/hooks/useUserAccessState.ts`
  - `src/hooks/useBillingHistory.ts` (para manter coerência de tenant/contexto)

Detalhe técnico importante
- Hoje o sistema já prova a inconsistência:
  - `BillingPaymentHistory` lê `tenant_entitlements` via `tenant_members`
  - `get_user_feature_flags` mais recente já foi parcialmente mudada para `company_users`
  - `check_ml_api_access` e revisões anteriores ainda usam resolução diferente
- O conserto definitivo é padronizar tudo em cima do mesmo relacionamento e da mesma tabela principal de direito de acesso (`tenant_entitlements`).

Resultado esperado
- Usuário pago nunca mais verá mensagem de “contratar plano” se houver entitlement ativo.
- Trial expirado só bloqueia quem realmente não tem direito ativo.
- A ativação fica consistente para os usuários atuais e para os próximos que estão chegando.
