import { ReactNode } from 'react';
import { useShippingEligibility } from '@/hooks/useShippingEligibility';
import { useUserAccessState } from '@/hooks/useUserAccessState';
import { ShippingBlockedScreen } from './ShippingBlockedScreen';

interface ShippingEligibilityGuardProps {
  children: ReactNode;
}

/**
 * Route-level guard for shipping/label features.
 * Shows an informational blocked screen when the seller is not eligible.
 * Never blocks dashboard or general navigation.
 *
 * Trial: todo usuário novo tem 14 dias de teste com acesso total.
 * Durante o trial nenhuma regra de volume/plano pode bloquear o módulo.
 */
export function ShippingEligibilityGuard({ children }: ShippingEligibilityGuardProps) {
  const { eligible, loading, sellerId, reason } = useShippingEligibility();
  const { trialActive } = useUserAccessState();

  if (trialActive) return <>{children}</>;

  // Fail-open while validating eligibility so route/auth rechecks never replace
  // the operational screen with a spinner on tab focus or route return.
  if (!loading && !eligible) {
    return <ShippingBlockedScreen sellerId={sellerId} reason={reason} />;
  }

  return <>{children}</>;
}

