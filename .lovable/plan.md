
## Diagnóstico — engenharia@megatools.com.br

Confirmei via banco:
- Perfil: tag = `VETERANO` ✅ (migrada em 24/04 a partir do antigo cadastro Gmail)
- `tenant_members`: owner do tenant `0cf61d63-…` ✅
- `user_access_state`: `payment_status='trial'`, `trial_status='active'` (até 29/04), ML conectado como owner
- `tenant_subscription` / `tenant_entitlements` / `tenant_payments`: **vazios** — ele nunca conseguiu efetivar o checkout
- Tier `veterano` existe e está ativo; 3 ofertas (mensal R$44,90 / trimestral R$120 / semestral R$216) existem, todas com `is_active=true` mas `is_visible=false` e sem `mp_product_ref`

## Causa raiz do bloqueio

A tela `/settings → Plano` (`SettingsPlan.tsx`) lista os tiers vindos do `useTierOffersCatalog` (edge `billing-public-plans`) **sem nenhum tratamento Veterano**:

1. A edge function só retorna ofertas com `is_visible=true`. Como as 3 ofertas Veteranas são invisíveis, o tier Veterano chega com `offers: []`.
2. `SettingsPlan.tsx` mostra o card mesmo assim (não filtra), mas:
   - `getSelectedOffer(tier)` retorna `null`
   - O botão "Escolher plano" chama `checkout(undefined)` → falha silenciosa
3. `SettingsPlan.tsx` não diferencia veterano de não-veterano: o tier Veterano aparece para **todos** os usuários (vazamento), e para o próprio veterano não há como contratar.

A página pública `/planos` (`Planos.tsx`) já trata o caso (busca ofertas escondidas e injeta), mas a tela de Settings — caminho mais natural para um cliente já logado — não. Foi ali que o megatools tentou.

Bônus: `billing-checkout` já lida bem com offers sem `mp_product_ref` (cria preapproval ad-hoc), então uma vez que a oferta chegue, o checkout funciona.

## Plano de correção

### 1. `SettingsPlan.tsx` — espelhar a lógica veterana de `Planos.tsx`
- Buscar `profiles.tag` do usuário logado.
- Se `tag === 'VETERANO'`: buscar ofertas Veteranas (`plan_offers` por `tier_id` veterano, `is_active=true`) e injetar em `tier.offers` para o tier `code='veterano'`.
- Se não for veterano: filtrar `tiers.filter(t => t.code !== 'veterano')` para esconder o tier no Settings (vazamento atual).

### 2. `Planos.tsx` — endurecer lookup do perfil
Linha 56 usa `.eq('id', user.id)`. Funciona por coincidência (na maioria dos perfis `id == user_id`), mas é frágil. Trocar para `.eq('user_id', user.id)` para evitar quebrar usuários onde os IDs divergem.

### 3. UX defensiva em `SettingsPlan.tsx`
- Desabilitar o botão "Escolher plano" quando `getSelectedOffer(tier)` for `null`, com label "Indisponível" + tooltip "Sem oferta configurada para este plano". Evita silenciar futuras inconsistências.

### 4. (Opcional, recomendado) toast no `useOfferCheckout`
Quando `offer.id` for falsy, mostrar `toast.error("Oferta indisponível. Contate o suporte.")` em vez de chamar a edge function com payload inválido.

### 5. Validação manual após deploy
- Logar como megatools, ir em **Configurações → Plano**, verificar que o card Veterano aparece com as 3 opções (Mensal/Trimestral/Semestral) e o botão funciona.
- Logar com qualquer usuário não-veterano e confirmar que o tier Veterano **não aparece**.
- Concluir um checkout de teste (mensal R$44,90) para validar a criação de preapproval ad-hoc (sem `mp_product_ref`) e gerar o registro em `tenant_subscription` via webhook.

## Arquivos afetados
- `src/components/settings/SettingsPlan.tsx` (lógica veterano + UX defensiva)
- `src/pages/Planos.tsx` (corrigir `eq('id'…)` → `eq('user_id'…)`)
- `src/hooks/useTierOffers.ts` (toast quando offer ausente)

## Notas
- Não tocar na edge function `billing-public-plans`: manter ofertas veteranas invisíveis no catálogo público é o comportamento desejado (memória `veterano-tier-policy`).
- Não exige migração de banco — as ofertas já existem.
- Após o checkout aprovado, o webhook MP populará `tenant_subscription` e `tenant_entitlements`, liberando definitivamente o acesso (hoje ele está rodando em trial até 29/04).
