

## Diagnóstico: Página /planos não carrega os planos

### Causa raiz
A tabela `plan_tiers` tem RLS habilitado com política SELECT apenas para o role `authenticated`. A Edge Function `billing-public-plans` usa o `SUPABASE_ANON_KEY` (role `anon`), então a query retorna `tiers: []`.

As outras tabelas (`plan_offers`, `plan_addons`, `plan_addon_offers`, `plan_settings`, `trial_policy`) já têm políticas com role `public` — por isso os addons aparecem normalmente.

### Correção
Uma única migration SQL:

```sql
CREATE POLICY "anyone_can_read_plan_tiers"
ON public.plan_tiers
FOR SELECT
TO public
USING (true);
```

Isso permite leitura pública dos tiers (que são dados de catálogo, não sensíveis). A política antiga `plans_select` (apenas `authenticated`) pode ser removida ou mantida (é redundante se `public` já cobre).

Opcionalmente, remover a antiga:
```sql
DROP POLICY "plans_select" ON public.plan_tiers;
```

### Sobre o CTA dos botões
O usuário mencionou que o link dos planos deve ir para cadastro (não contratação). Atualmente o botão "Contratar"/"Assinar" chama `checkout(offer.id)`. Para visitantes não autenticados, o comportamento correto seria redirecionar para `/auth`. Vou verificar se o `useOfferCheckout` já lida com isso ou se precisa de ajuste no `handleOfferClick` para redirecionar usuários não-logados para `/auth?plan=TIER_CODE`.

### Mudanças

1. **Migration**: Adicionar política RLS pública de leitura em `plan_tiers`
2. **Planos.tsx**: Ajustar `handleOfferClick` — se não autenticado, redirecionar para `/auth?plan=TIER_CODE` ao invés de chamar checkout

