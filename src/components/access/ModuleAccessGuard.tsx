import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useCollaboratorAccess, getModuleKeyFromRoute } from '@/hooks/useCollaboratorAccess';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ModuleAccessGuardProps {
  children: React.ReactNode;
}

/**
 * Route guard component that checks if the current user has access to the current route.
 * If they don't have access (collaborator without module permission), redirects to dashboard.
 */
export function ModuleAccessGuard({ children }: ModuleAccessGuardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isCollaborator, isLoading, hasModuleAccess } = useCollaboratorAccess();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // eslint-disable-next-line no-console
    console.info('[MOUNT] ModuleAccessGuard');
    return () => {
      // eslint-disable-next-line no-console
      console.info('[UNMOUNT] ModuleAccessGuard');
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // eslint-disable-next-line no-console
    console.info('[NAV] ModuleAccessGuard', location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    if (!isLoading) {
      setTimedOut(false);
      return;
    }
    setTimedOut(false);
    const t = window.setTimeout(() => setTimedOut(true), 15_000);
    return () => window.clearTimeout(t);
  }, [isLoading, location.pathname]);

  useEffect(() => {
    if (isLoading) return;
    if (!isCollaborator) return; // Admin/owner has full access

    const moduleKey = getModuleKeyFromRoute(location.pathname);
    
    // Routes that don't require module access check
    const publicRoutes = ['/dashboard', '/settings', '/auth', '/'];
    if (publicRoutes.includes(location.pathname)) return;

    // If route is not in module map, allow it (might be a misc route)
    if (!moduleKey) return;

    // Check access
    if (!hasModuleAccess(moduleKey)) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[ACCESS] collaborator blocked route', { moduleKey, pathname: location.pathname });
      }
      toast.error('Acesso não liberado para este módulo');
      navigate('/dashboard', { replace: true });
    }
  }, [isLoading, isCollaborator, location.pathname, hasModuleAccess, navigate]);

  if (isLoading) {
    if (timedOut) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="flex flex-col items-center gap-3 text-center max-w-md">
            <p className="text-sm text-muted-foreground">
              O carregamento de permissões demorou mais que o esperado.
            </p>
            <div className="flex gap-2">
              <Button onClick={() => window.location.reload()}>Tentar novamente</Button>
              <Button variant="outline" onClick={() => navigate('/dashboard', { replace: true })}>
                Voltar
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
