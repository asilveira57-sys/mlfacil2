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
      const { data: membership } = await supabase
        .from('tenant_members')
        .select('tenant_id')
        .eq('user_id', userId!)
        .limit(1)
        .maybeSingle();

      if (!membership?.tenant_id) {
        return { state: 'no_plan' as const, periodEnd: null as string | null };
      }

      const { data: ent } = await (supabase as any)
        .from('tenant_entitlements')
        .select('current_period_end, status')
        .eq('tenant_id', membership.tenant_id)
        .eq('entitlement_type', 'tier')
        .eq('status', 'active')
        .order('current_period_end', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!ent) return { state: 'no_plan' as const, periodEnd: null };

      const periodEnd = ent.current_period_end as string | null;
      if (!periodEnd) return { state: 'active' as const, periodEnd: null };

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
