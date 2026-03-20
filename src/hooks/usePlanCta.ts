import { useUserAccess } from '@/contexts/UserAccessContext';
import { useNavigate } from 'react-router-dom';
import { useBillingCheckout } from '@/hooks/useBillingPlans';
import type { PricingMode } from '@/hooks/useTierPlans';

export type CtaAction = 
  | 'start_trial' 
  | 'subscribe' 
  | 'buy' 
  | 'access_system' 
  | 'manage_plan';

export interface CtaConfig {
  label: string;
  action: CtaAction;
  variant: 'default' | 'secondary' | 'outline';
}

interface UsePlanCtaReturn {
  getCtaConfig: (mode: PricingMode) => CtaConfig;
  handleCtaClick: (config: CtaConfig, priceId?: string, planSlug?: string, mode?: PricingMode, cycle?: string) => void;
  isLoading: boolean;
}

export function usePlanCta(): UsePlanCtaReturn {
  const navigate = useNavigate();
  const { isAuthenticated, trialActive, trialExpired, flags } = useUserAccess();
  const { checkout, loading: checkoutLoading } = useBillingCheckout();

  // Determine CTA based on user state and pricing mode
  const getCtaConfig = (mode: PricingMode): CtaConfig => {
    // Rule: if not authenticated, treat as never used trial
    if (!isAuthenticated) {
      return {
        label: 'Fazer Teste',
        action: 'start_trial',
        variant: 'default',
      };
    }

    // Authenticated user with active trial
    if (trialActive) {
      return {
        label: 'Acessar sistema',
        action: 'access_system',
        variant: 'secondary',
      };
    }

    // Check if user has active subscription
    const hasActiveSubscription = flags?.has_active_subscription;
    
    if (hasActiveSubscription) {
      return {
        label: 'Gerenciar plano',
        action: 'manage_plan',
        variant: 'outline',
      };
    }

    // User has used trial (expired) and no active subscription
    // -> Need to purchase/subscribe based on mode
    if (trialExpired || !trialActive) {
      if (mode === 'assinatura') {
        return {
          label: 'Assinar plano',
          action: 'subscribe',
          variant: 'default',
        };
      } else {
        return {
          label: 'Comprar plano',
          action: 'buy',
          variant: 'default',
        };
      }
    }

    // Default: user hasn't used trial yet
    return {
      label: 'Fazer Teste',
      action: 'start_trial',
      variant: 'default',
    };
  };

  const handleCtaClick = async (
    config: CtaConfig, 
    priceId?: string,
    planSlug?: string,
    mode?: PricingMode,
    cycle?: string
  ) => {
    switch (config.action) {
      case 'start_trial':
        // Preserve plan selection for after auth
        const params = new URLSearchParams();
        if (planSlug) params.set('plan', planSlug);
        if (mode) params.set('mode', mode);
        if (cycle) params.set('cycle', cycle);
        
        const queryString = params.toString();
        navigate(`/auth${queryString ? `?${queryString}` : ''}`);
        break;

      case 'subscribe':
      case 'buy':
        if (priceId) {
          await checkout(priceId);
        }
        break;

      case 'access_system':
        navigate('/dashboard');
        break;

      case 'manage_plan':
        navigate('/settings?section=plano');
        break;
    }
  };

  return {
    getCtaConfig,
    handleCtaClick,
    isLoading: checkoutLoading,
  };
}
