import { useUserAccess } from '@/contexts/UserAccessContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Lock, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface TrialModuleGateProps {
  /** What feature is blocked */
  feature: string;
  /** Custom message to show */
  message?: string;
  /** If true, renders children but shows a warning banner above them */
  soft?: boolean;
  /** Children to render when access is allowed (or in soft mode) */
  children: React.ReactNode;
}

/**
 * Gate component that blocks or warns about trial-restricted features.
 * 
 * - Hard mode (default): Replaces children with a blocked message
 * - Soft mode: Shows a banner above children
 */
export function TrialModuleGate({ feature, message, soft = false, children }: TrialModuleGateProps) {
  const navigate = useNavigate();
  const { flags, loading, isAuthenticated, trialActive, trialExpired } = useUserAccess();

  if (loading || !isAuthenticated || !flags) return <>{children}</>;

  // If user has active subscription, allow everything
  if (flags.has_active_subscription) return <>{children}</>;

  const isBlocked = trialActive || trialExpired;
  if (!isBlocked) return <>{children}</>;

  const defaultMessage = trialExpired
    ? `${feature} está bloqueado. Seu período de teste expirou.`
    : `${feature} estará disponível após a ativação do plano. Durante o teste, essa funcionalidade é limitada.`;

  const banner = (
    <Alert className="mb-4 border-warning/50 bg-warning/10">
      {trialExpired ? <Lock className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
      <AlertDescription className="flex items-center justify-between gap-4 flex-wrap">
        <span className="text-sm">{message || defaultMessage}</span>
        <Button size="sm" variant="outline" onClick={() => navigate('/planos')}>
          Ver planos
        </Button>
      </AlertDescription>
    </Alert>
  );

  if (soft) {
    return (
      <>
        {banner}
        {children}
      </>
    );
  }

  // Hard block
  return banner;
}
