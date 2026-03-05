import { useUserAccess } from '@/contexts/UserAccessContext';
import { useNavigate } from 'react-router-dom';
import { useTenantCheckout } from '@/hooks/useTenantCheckout';

export type TenantCtaAction = 
  | 'start_trial' 
  | 'subscribe' 
  | 'access_system' 
  | 'manage_plan'
  | 'contact_enterprise';

export interface TenantCtaConfig {
  label: string;
  action: TenantCtaAction;
  variant: 'default' | 'secondary' | 'outline';
}

export function useTenantPlanCta() {
  const navigate = useNavigate();
  const { isAuthenticated, trialActive, trialExpired, flags } = useUserAccess();
  const { checkout, loading: checkoutLoading } = useTenantCheckout();

  const getCtaConfig = (isEnterprise: boolean): TenantCtaConfig => {
    if (isEnterprise) {
      return { label: 'Fale conosco', action: 'contact_enterprise', variant: 'outline' };
    }

    if (!isAuthenticated) {
      return { label: 'Fazer Teste Grátis', action: 'start_trial', variant: 'default' };
    }

    if (trialActive) {
      return { label: 'Acessar sistema', action: 'access_system', variant: 'secondary' };
    }

    const hasActiveSub = flags?.has_active_subscription;
    if (hasActiveSub) {
      return { label: 'Gerenciar plano', action: 'manage_plan', variant: 'outline' };
    }

    return { label: 'Assinar plano', action: 'subscribe', variant: 'default' };
  };

  const handleCtaClick = async (config: TenantCtaConfig, planCode?: string) => {
    switch (config.action) {
      case 'start_trial':
        const params = planCode ? `?plan=${planCode}` : '';
        navigate(`/auth${params}`);
        break;
      case 'subscribe':
        if (planCode) await checkout(planCode);
        break;
      case 'access_system':
        navigate('/dashboard');
        break;
      case 'manage_plan':
        navigate('/settings');
        break;
      case 'contact_enterprise':
        navigate('/contato');
        break;
    }
  };

  return { getCtaConfig, handleCtaClick, isLoading: checkoutLoading };
}
