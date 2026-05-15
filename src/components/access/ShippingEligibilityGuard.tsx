import { ReactNode } from 'react';
import { useShippingEligibility } from '@/hooks/useShippingEligibility';
import { ShippingBlockedScreen } from './ShippingBlockedScreen';

interface ShippingEligibilityGuardProps {
  children: ReactNode;
}

/**
 * Route-level guard for shipping/label features.
 * Shows an informational blocked screen when the seller is not eligible.
 * Never blocks dashboard or general navigation.
 */
export function ShippingEligibilityGuard({ children }: ShippingEligibilityGuardProps) {
  const { eligible, loading, sellerId, reason } = useShippingEligibility();

  // Fail-open while validating eligibility so route/auth rechecks never replace
  // the operational screen with a spinner on tab focus or route return.
  if (!loading && !eligible) {
    return <ShippingBlockedScreen sellerId={sellerId} reason={reason} />;
  }

  return <>{children}</>;
}
