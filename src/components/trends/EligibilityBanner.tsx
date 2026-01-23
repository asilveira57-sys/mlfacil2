import { AlertTriangle, TrendingUp, FolderTree } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { EligibilityState, ELIGIBILITY_TEXTS } from '@/hooks/useCategoryEligibility';

interface EligibilityBannerProps {
  state: EligibilityState;
  ordersCount?: number;
  thresholdOrders?: number;
  onActionClick?: () => void;
  className?: string;
}

export function EligibilityBanner({
  state,
  ordersCount = 0,
  thresholdOrders = 10,
  onActionClick,
  className = '',
}: EligibilityBannerProps) {
  if (state === 'eligible' || state === 'loading' || state === 'unknown') {
    return null;
  }

  const texts = state === 'inactive' ? ELIGIBILITY_TEXTS.inactive : ELIGIBILITY_TEXTS.low_base;
  const Icon = state === 'inactive' ? FolderTree : AlertTriangle;
  const iconColor = state === 'inactive' ? 'text-muted-foreground' : 'text-amber-500';
  const variant = state === 'inactive' ? 'default' : 'default';

  return (
    <Alert 
      variant={variant} 
      className={`border-amber-500/30 bg-amber-500/5 ${className}`}
    >
      <Icon className={`h-5 w-5 ${iconColor}`} />
      <AlertTitle className="text-base font-medium">{texts.title}</AlertTitle>
      <AlertDescription className="mt-2">
        <p className="text-sm text-muted-foreground mb-4">
          {texts.description}
        </p>
        
        {state === 'low_base' && ordersCount > 0 && (
          <p className="text-xs text-muted-foreground mb-3">
            <span className="font-medium text-foreground">{ordersCount}</span> pedidos encontrados 
            (mínimo: <span className="font-medium">{thresholdOrders}</span>)
          </p>
        )}

        {onActionClick && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onActionClick}
            className="mt-2"
          >
            <TrendingUp className="h-4 w-4 mr-2" />
            {texts.action}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
