<final-text>
Objetivo

Corrigir com urgência o bloqueio indevido de clientes pagos no módulo de Etiquetas e eliminar a divergência entre “plano ativo” e “acesso bloqueado”.

Diagnóstico confirmado

O pagamento do ADX existe e o direito está ativo.
Eu confirmei no banco:

- Conta: `loja@adeconex.com.br`
- Empresa: `ADX`
- Plano ativo: `51 a 300 pedidos/mês`
- Entitlement ativo até: `24/04/2026 11:24 UTC`
- Pagamento aprovado: `150910495973`

Ou seja: o problema não é cobrança nem ausência de plano.

Causa raiz

Existe uma divergência entre duas camadas de acesso:

1. `get_user_feature_flags`
- reconhece corretamente que o cliente está pago
- retorna:
  - `has_active_subscription = true`
  - `can_print_labels = true`
  - `can_import_sales = true`

2. `check_ml_api_access`
- ainda está retornando `trial_expired`
- isso faz a tela de Etiquetas bloquear o usuário aqui:
  - `src/pages/ShippingLabels.tsx`
  - condição: `if (!mlAllowed && isTrialExpired) return <TrialExpiredScreen />`

Resultado:
- o sistema “sabe” que o cliente está ativo
- mas a página de Etiquetas usa outra checagem, que contradiz isso
- por isso o usuário pago vê “Período de teste finalizado”

Impacto real encontrado

Não é só o ADX.

Eu confirmei pelo menos 2 clientes pagos afetados agora:
- `loja@adeconex.com.br` — bloqueado indevidamente com plano `51 a 300`
- `overlordcomerciobrasil@gmail.com` — também inconsistido; no caso dele há um plano `ZPL Básico`, e hoje a função está classificando como `trial_expired` em vez de classificar corretamente pela regra do plano

Então o bug é sistêmico na função central de acesso da API do ML, não um caso isolado.

Plano de correção

1. Corrigir a função de backend `check_ml_api_access`
Ajustar a lógica para respeitar a mesma prioridade usada no restante do sistema:
- entitlement ativo deve liberar acesso imediatamente
- `payment_status = active` não pode cair em `trial_expired`
- plano ZPL deve retornar motivo correto (`zpl_plan`), nunca `trial_expired`
- manter resolução por:
  - `company_users`
  - `companies.user_id`
  - `tenant_id`

2. Unificar a regra de acesso da tela de Etiquetas
Garantir que `/shipping-labels` não dependa de uma interpretação divergente da assinatura.
A tela deve obedecer a mesma verdade operacional de acesso que já aparece em:
- histórico de cobrança
- feature flags
- status de assinatura

3. Corrigir os clientes já afetados
Executar uma correção de dados para os usuários com:
- `payment_status = active`
- mas `check_ml_api_access = trial_expired`

No mínimo:
- ADX
- overlordcomerciobrasil@gmail.com

E fazer o auto-heal para que, ao consultar novamente, o estado fique consistente.

4. Fazer varredura preventiva
Depois da correção, rodar uma checagem para listar qualquer conta com:
- pagamento ativo ou entitlement ativo
- mas acesso ML bloqueado

Isso evita que o suporte descubra caso a caso.

Validação após implementação

1. Validar ADX
- abrir conta `loja@adeconex.com.br`
- acessar Etiquetas
- confirmar que não aparece mais “Período de teste finalizado”

2. Validar o segundo caso encontrado
- confirmar que a conta não cai mais em motivo errado
- se for ZPL, bloquear pela razão correta do plano, não por trial expirado

3. Validar regressão global
- consultar novamente quantos clientes pagos continuam bloqueados
- resultado esperado: `0` casos pagos com `trial_expired`

Arquivos/áreas a ajustar

- `src/pages/ShippingLabels.tsx`
- migration SQL nova para corrigir:
  - `public.check_ml_api_access`
  - eventual auto-heal de estado
  - backfill dos usuários inconsistentes

Resultado esperado

Depois dessa correção:
- cliente pago não volta a ver bloqueio de trial expirado
- ADX volta a usar Etiquetas normalmente
- o sistema deixa de ter duas “verdades” diferentes sobre acesso
- você passa a ter uma base limpa para suporte, sem ficar corrigindo cliente por cliente
</final-text>