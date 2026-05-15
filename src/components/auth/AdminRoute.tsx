import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AdminRouteProps {
  children: React.ReactNode;
}

/**
 * Route guard for admin-only routes.
 *
 * Fail-open behavior (anti white-screen on tab switch):
 * - First check: shows spinner only until role is resolved the first time.
 * - After first resolution: keeps children mounted while role re-validates in
 *   the background. This prevents remount/spinner when returning to the tab.
 * - If role flips to non-admin, redirects normally.
 */
export function AdminRoute({ children }: AdminRouteProps) {
  const { isAdmin, loading } = useUserRole();
  const navigate = useNavigate();
  const [timedOut, setTimedOut] = useState(false);
  const hasResolvedOnceRef = useRef(false);
  const wasAdminRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.info('[MOUNT] AdminRoute');
    return () => console.info('[UNMOUNT] AdminRoute');
  }, []);

  useEffect(() => {
    if (!loading) {
      hasResolvedOnceRef.current = true;
      wasAdminRef.current = isAdmin;
      setTimedOut(false);
      return;
    }
    setTimedOut(false);
    const t = window.setTimeout(() => setTimedOut(true), 6_000);
    return () => window.clearTimeout(t);
  }, [loading, isAdmin]);

  useEffect(() => {
    if (loading) return;
    if (!isAdmin) {
      if (import.meta.env.DEV) {
        console.warn('[ADMIN] blocked - redirecting to /settings');
      }
      toast.error('Acesso restrito a administradores');
      navigate('/settings', { replace: true });
    }
  }, [loading, isAdmin, navigate]);

  // First-time check: still loading and never resolved → cheap spinner.
  if (loading && !hasResolvedOnceRef.current) {
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

  // After first resolution: render children even if a background re-check
  // is in flight. Only block if we know for sure the user is not admin.
  if (!isAdmin && hasResolvedOnceRef.current && !loading) {
    return null;
  }

  return <>{children}</>;
}
