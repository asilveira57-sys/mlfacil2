import { useTrialStatus, useUserAccess } from '@/contexts/UserAccessContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Clock, AlertTriangle, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface TrialBannerProps {
  className?: string;
  compact?: boolean;
}

export function TrialBanner({ className, compact = false }: TrialBannerProps) {
  const navigate = useNavigate();
  const { loading, isAuthenticated } = useUserAccess();
  const { isActive, isExpired, daysRemaining, warnings } = useTrialStatus();

  // Don't show if not authenticated or still loading
  if (loading || !isAuthenticated) return null;

  // Trial expired - show urgent banner
  if (isExpired) {
    return (
      <Alert 
        variant="destructive" 
        className={cn('border-destructive/50 bg-destructive/10', className)}
      >
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between gap-4 flex-wrap">
          <span className="font-medium">
            Seu período de teste expirou. Escolha um plano para continuar.
          </span>
          <Button 
            size={compact ? 'sm' : 'default'} 
            variant="destructive"
            onClick={() => navigate('/planos')}
          >
            Escolher plano
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // Trial active - show info banner
  if (isActive) {
    const isUrgent = daysRemaining <= 3;
    
    return (
      <div className={cn('space-y-2', className)}>
        <Alert 
          className={cn(
            'border-primary/30',
            isUrgent && 'border-warning/50 bg-warning/10'
          )}
        >
          <Clock className={cn('h-4 w-4', isUrgent ? 'text-warning' : 'text-primary')} />
          <AlertDescription className="flex items-center justify-between gap-4 flex-wrap">
            <span>
              {isUrgent ? (
                <strong>Apenas {daysRemaining} dia{daysRemaining !== 1 ? 's' : ''} restante{daysRemaining !== 1 ? 's' : ''} de teste!</strong>
              ) : (
                <>
                  <Sparkles className="inline h-3.5 w-3.5 mr-1 text-primary" />
                  Teste gratuito: <strong>{daysRemaining} dias</strong> restantes
                </>
              )}
            </span>
            {!compact && (
              <Button 
                size="sm" 
                variant={isUrgent ? 'default' : 'outline'}
                onClick={() => navigate('/planos')}
              >
                Ver planos
              </Button>
            )}
          </AlertDescription>
        </Alert>

        {/* Show trial warnings if any */}
        {warnings.length > 0 && warnings.map((warning, idx) => (
          <Alert key={idx} className="border-muted bg-muted/30">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            <AlertDescription className="text-sm text-muted-foreground">
              {warning}
            </AlertDescription>
          </Alert>
        ))}
      </div>
    );
  }

  return null;
}
