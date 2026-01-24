import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

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

  useEffect(() => {
    if (!loading && !isAdmin) {
      toast.error('Acesso restrito a administradores');
      navigate('/settings', { replace: true });
    }
  }, [loading, isAdmin, navigate]);

  // Show loading state while checking role
  if (loading) {
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
