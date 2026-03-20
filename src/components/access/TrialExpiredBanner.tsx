import { useUserAccess } from '@/contexts/UserAccessContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * TrialExpiredBanner - Shows a banner when ML API access is blocked
 * 
 * Place this at the top of pages that depend on ML API data.
 * Only shows when ml_api_access_allowed is false and there's a reason.
 */
export function TrialExpiredBanner() {
  const navigate = useNavigate();
  const { flags, loading, isAuthenticated, mlApiAccessAllowed } = useUserAccess();

  if (loading || !isAuthenticated || !flags) return null;
  if (mlApiAccessAllowed) return null;

  const reason = flags.ml_api_access_reason;
  const message = flags.ml_api_access_message;

  // Don't show for users who never had a trial
  if (reason === 'no_company' || reason === 'no_trial') return null;

  const isTrialExpired = reason === 'trial_expired';
  const isZplPlan = reason === 'zpl_plan';

  return (
    <Alert 
      variant={isTrialExpired ? 'destructive' : 'default'} 
      className="mb-4"
    >
      {isTrialExpired ? (
        <AlertTriangle className="h-4 w-4" />
      ) : (
        <Lock className="h-4 w-4" />
      )}
      <AlertDescription className="flex items-center justify-between gap-4 flex-wrap">
        <span>
          {isTrialExpired
            ? 'Seu período de teste terminou. Os dados já importados continuam disponíveis, mas a sincronização ficou bloqueada.'
            : isZplPlan
              ? 'Plano ZPL não inclui sincronização com o Mercado Livre.'
              : message || 'Acesso à sincronização bloqueado.'}
        </span>
        {isTrialExpired && (
          <Button size="sm" onClick={() => navigate('/settings?section=plano')}>
            Assinar plano
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

/**
 * Hook to check if ML sync actions should be disabled
 */
export function useMlApiAccess() {
  const { flags, loading, mlApiAccessAllowed } = useUserAccess();

  return {
    loading,
    allowed: mlApiAccessAllowed,
    reason: flags?.ml_api_access_reason ?? null,
    message: flags?.ml_api_access_message ?? null,
    isTrialExpired: flags?.ml_api_access_reason === 'trial_expired',
    isZplPlan: flags?.ml_api_access_reason === 'zpl_plan',
    trialEndAt: flags?.trial_end_at ? new Date(flags.trial_end_at) : null,
    trialDaysRemaining: flags?.trial_days_remaining ?? 0,
  };
}
