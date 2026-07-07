import { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserAccessState } from '@/hooks/useUserAccessState';
import { SystemBlocked, SystemLoading } from '@/components/ui/system-states';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

/**
 * Gate de acesso para o Conversor ZPL (/zpl-converter).
 *
 * IMPORTANTE: O plano ZPL é desacoplado de vendas (ver memória
 * "ZPL Unlimited Volume Policy"). Portanto NÃO usamos a regra de
 * "sales_30d" do ShippingEligibilityGuard. O único gate aplicável é
 * a vigência do entitlement do tenant.
 *
 * Estados:
 *  - loading       → SystemLoading
 *  - sem plano     → SystemBlocked com CTA para escolher plano
 *  - plano vencido → SystemBlocked com mensagem específica e CTA renovação
 *  - vigente       → children
 */
export function ZplConverterAccessGuard({ children }: { children: ReactNode }) {
  const { status } = useUserAccessState();
  const userId = status?.user_id;
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['zpl-converter-access', userId],
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      // Collect candidate tenant IDs: user's own tenant_members + parent companies
      // where the user is a collaborator (company_users). This ensures collaborators
      // inherit the plan from the titular workspace.
      const tenantIds = new Set<string>();
      const candidateUserIds = new Set<string>([userId!]);

      // Collaborator inheritance: resolve titular (created_by) so this
      // guard mirrors useCanAccessModule and doesn't block collaborators
      // of a plan-holding titular. Fixes "Nenhum plano ativo" on /zpl-converter
      // for users like Marlon (adeconexexped@gmail.com).
      try {
        const { data: collab } = await (supabase as any)
          .from('collaborators')
          .select('created_by')
          .eq('auth_user_id', userId!)
          .eq('status', 'active')
          .is('deleted_at', null)
          .order('accepted_at', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();
        if (collab?.created_by) candidateUserIds.add(collab.created_by);
      } catch { /* fall back to own userId */ }

      const userIdList = Array.from(candidateUserIds);

      const { data: ownMemberships } = await supabase
        .from('tenant_members')
        .select('tenant_id')
        .in('user_id', userIdList);
      (ownMemberships ?? []).forEach((m: any) => m?.tenant_id && tenantIds.add(m.tenant_id));

      const { data: companyUsers } = await supabase
        .from('company_users')
        .select('company_id')
        .in('user_id', userIdList)
        .eq('status', 'active');

      const companyIds = (companyUsers ?? []).map((c: any) => c.company_id).filter(Boolean);
      if (companyIds.length) {
        const { data: comps } = await supabase
          .from('companies')
          .select('tenant_id')
          .in('id', companyIds);
        (comps ?? []).forEach((c: any) => c?.tenant_id && tenantIds.add(c.tenant_id));
      }

      if (tenantIds.size === 0) {
        return { state: 'no_plan' as const, periodEnd: null as string | null };
      }

      // Aceita tanto plano (tier) quanto addon ZPL FULL (addon_zpl_full).
      // O Conversor ZPL pode ser liberado por qualquer um dos dois.
      const { data: ents } = await (supabase as any)
        .from('tenant_entitlements')
        .select('current_period_end, status, tenant_id, entitlement_type, addon_id, plan_addons:addon_id(code)')
        .in('tenant_id', Array.from(tenantIds))
        .in('entitlement_type', ['tier', 'addon'])
        .eq('status', 'active')
        .order('current_period_end', { ascending: false });

      const valid = (ents ?? []).filter((e: any) =>
        e.entitlement_type === 'tier' ||
        (e.entitlement_type === 'addon' && e.plan_addons?.code === 'zpl_full')
      );

      if (valid.length === 0) {
        return { state: 'no_plan' as const, periodEnd: null };
      }

      // Pick the best one: any without expiry = active forever, else latest period_end
      const noExpiry = valid.find((e: any) => !e.current_period_end);
      if (noExpiry) return { state: 'active' as const, periodEnd: null };

      const best = valid[0];
      const periodEnd = best.current_period_end as string;
      const expired = new Date(periodEnd).getTime() < Date.now();
      return {
        state: expired ? ('expired' as const) : ('active' as const),
        periodEnd,
      };
    },
  });

  if (isLoading || !data) return <SystemLoading message="Verificando seu plano…" />;

  if (data.state === 'active') return <>{children}</>;

  if (data.state === 'expired') {
    const dt = data.periodEnd
      ? new Date(data.periodEnd).toLocaleDateString('pt-BR')
      : '';
    return (
      <SystemBlocked
        title="Seu plano está vencido"
        message={`O seu plano venceu em ${dt}. Renove para continuar usando o Conversor ZPL.`}
        hint="Você mantém o acesso ao restante do MKTP Fácil; este módulo exige plano vigente."
      >
        <div className="mt-4 flex justify-center">
          <Button onClick={() => navigate('/planos')}>Renovar plano</Button>
        </div>
      </SystemBlocked>
    );
  }

  return (
    <SystemBlocked
      title="Nenhum plano ativo"
      message="Você ainda não possui um plano ativo para usar o Conversor ZPL."
      hint="Escolha um plano para liberar o módulo."
    >
      <div className="mt-4 flex justify-center">
        <Button onClick={() => navigate('/planos')}>Ver planos</Button>
      </div>
    </SystemBlocked>
  );
}
