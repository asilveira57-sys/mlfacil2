import { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!eligible) {
    return <ShippingBlockedScreen sellerId={sellerId} reason={reason} />;
  }

  return <>{children}</>;
}
