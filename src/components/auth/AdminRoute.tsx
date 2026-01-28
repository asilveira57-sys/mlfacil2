import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AdminRouteProps {
  children: React.ReactNode;
}

/**
 * Route guard component that only allows admin users to access children.
 * Redirects non-admin users to /settings with a toast notification.
 */
export function AdminRoute({ children }: AdminRouteProps) {
  const { isAdmin, loading } = useUserRole();
  const navigate = useNavigate();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // eslint-disable-next-line no-console
    console.info('[MOUNT] AdminRoute');
    return () => {
      // eslint-disable-next-line no-console
      console.info('[UNMOUNT] AdminRoute');
    };
  }, []);

  useEffect(() => {
    if (!loading) {
      setTimedOut(false);
      return;
    }
    setTimedOut(false);
    const t = window.setTimeout(() => setTimedOut(true), 15_000);
    return () => window.clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    if (!loading && !isAdmin) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[ADMIN] blocked - redirecting to /settings');
      }
      toast.error('Acesso restrito a administradores');
      navigate('/settings', { replace: true });
    }
  }, [loading, isAdmin, navigate]);

  // Show loading state while checking role
  if (loading) {
    if (timedOut) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="flex flex-col items-center gap-3 text-center max-w-md">
            <p className="text-sm text-muted-foreground">
              A verificação de permissões demorou mais que o esperado.
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Verificando permissões...</p>
        </div>
      </div>
    );
  }

  // Don't render anything if not admin (will redirect)
  if (!isAdmin) {
    return null;
  }

  return <>{children}</>;
}
