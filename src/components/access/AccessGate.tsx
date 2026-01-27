import { ReactNode } from 'react';
import { useUserAccess, useCanAccess } from '@/contexts/UserAccessContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Lock, AlertTriangle, Loader2, Crown, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ACCESS_MESSAGES } from '@/types/user-access';

type ResourceType = 'print_labels' | 'import_sales' | 'reports' | 'integrations';

interface AccessGateProps {
  children: ReactNode;
  resource: ResourceType;
  fallback?: ReactNode;
  showBlockedUI?: boolean;
}

/**
 * AccessGate - Wraps content that requires specific permissions
 * 
 * Follows the decision pipeline:
 * 1. Onboarding pending? → Show onboarding prompt
 * 2. Trial expired? → Show paywall
 * 3. ML owner required? → Show ML warning
 * 4. Resource allowed? → Show content
 */
export function AccessGate({ 
  children, 
  resource, 
  fallback,
  showBlockedUI = true 
}: AccessGateProps) {
  const navigate = useNavigate();
  const { 
    loading, 
    isAuthenticated,
    requiresOnboarding,
    requiresPayment,
    trialExpired,
    flags 
  } = useUserAccess();
  
  const canAccess = useCanAccess(resource);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Not authenticated
  if (!isAuthenticated) {
    if (!showBlockedUI) return fallback || null;
    
    return (
      <BlockedCard
        icon={<Lock className="h-8 w-8 text-muted-foreground" />}
        title="Acesso restrito"
        description="Faça login para acessar este recurso."
        action={
          <Button onClick={() => navigate('/auth')}>
            Fazer login
          </Button>
        }
      />
    );
  }

  // 1. Onboarding pending
  if (requiresOnboarding) {
    if (!showBlockedUI) return fallback || null;
    
    return (
      <BlockedCard
        icon={<Crown className="h-8 w-8 text-primary" />}
        title="Configure sua conta"
        description={ACCESS_MESSAGES.ONBOARDING_REQUIRED}
        action={
          <Button onClick={() => navigate('/onboarding')}>
            Iniciar configuração
          </Button>
        }
      />
    );
  }

  // 2. Trial expired / Payment required
  if (trialExpired || requiresPayment) {
    if (!showBlockedUI) return fallback || null;
    
    return (
      <BlockedCard
        icon={<AlertTriangle className="h-8 w-8 text-destructive" />}
        title="Teste finalizado"
        description={ACCESS_MESSAGES.TRIAL_EXPIRED}
        action={
          <Button onClick={() => navigate('/planos')}>
            Escolher plano
          </Button>
        }
      />
    );
  }

  // 3. ML owner required for import_sales
  if (resource === 'import_sales' && flags?.ml_requires_owner_warning) {
    if (!showBlockedUI) return fallback || null;
    
    return (
      <BlockedCard
        icon={<Lock className="h-8 w-8 text-warning" />}
        title="Conta colaborador detectada"
        description={ACCESS_MESSAGES.ML_COLLABORATOR_BLOCKED}
        action={
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => navigate('/settings?tab=integrations')}>
              Conectar conta titular
            </Button>
            <Button variant="outline" onClick={() => navigate('/planos')}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Ver plano ZPL
            </Button>
          </div>
        }
      />
    );
  }

  // 4. Check if resource is allowed
  if (!canAccess) {
    if (!showBlockedUI) return fallback || null;
    
    return (
      <BlockedCard
        icon={<Lock className="h-8 w-8 text-muted-foreground" />}
        title="Recurso bloqueado"
        description="Seu plano atual não inclui acesso a este recurso."
        action={
          <Button variant="outline" onClick={() => navigate('/planos')}>
            Ver planos
          </Button>
        }
      />
    );
  }

  // All checks passed - render children
  return <>{children}</>;
}

// Reusable blocked state card
interface BlockedCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

function BlockedCard({ icon, title, description, action }: BlockedCardProps) {
  return (
    <Card className="max-w-lg mx-auto">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4">
          {icon}
        </div>
        <CardTitle>{title}</CardTitle>
        <CardDescription className="text-sm mt-2">
          {description}
        </CardDescription>
      </CardHeader>
      {action && (
        <CardContent className="flex justify-center">
          {action}
        </CardContent>
      )}
    </Card>
  );
}

// Inline access check - shows alert instead of full card
interface AccessAlertProps {
  resource: ResourceType;
  children: ReactNode;
}

export function AccessAlert({ resource, children }: AccessAlertProps) {
  const canAccess = useCanAccess(resource);
  const { loading, flags } = useUserAccess();

  if (loading) return null;

  if (!canAccess) {
    // Check specific reason
    if (resource === 'import_sales' && flags?.ml_requires_owner_warning) {
      return (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {ACCESS_MESSAGES.ML_COLLABORATOR_BLOCKED}
          </AlertDescription>
        </Alert>
      );
    }

    return (
      <Alert className="mb-4">
        <Lock className="h-4 w-4" />
        <AlertDescription>
          Este recurso não está disponível no seu plano atual.
        </AlertDescription>
      </Alert>
    );
  }

  return <>{children}</>;
}
