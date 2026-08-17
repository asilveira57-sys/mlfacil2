import { ReactNode } from 'react';
import { useShippingEligibility } from '@/hooks/useShippingEligibility';
import { useUserAccessState } from '@/hooks/useUserAccessState';
import { useCanAccessModule } from '@/hooks/useCanAccessModule';
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
 * Plano pago: assinantes (inclusive contas vinculadas/secundárias do mesmo
 * titular) nunca são bloqueados pela regra de volume de vendas — o plano é
 * do tenant, não da conta ML.
 */
export function ShippingEligibilityGuard({ children }: ShippingEligibilityGuardProps) {
  const { eligible, loading, sellerId, reason } = useShippingEligibility();
  const { trialActive } = useUserAccessState();
  const { planCode, isLoading: planLoading } = useCanAccessModule();

  if (trialActive) return <>{children}</>;
  // Assinante ativo: libera independentemente do histórico de vendas da conta ML.
  if (planLoading || planCode) return <>{children}</>;

  // Fail-open while validating eligibility so route/auth rechecks never replace
  // the operational screen with a spinner on tab focus or route return.
  if (!loading && !eligible) {
    return <ShippingBlockedScreen sellerId={sellerId} reason={reason} />;
  }

  return <>{children}</>;
}


