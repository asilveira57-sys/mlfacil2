import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useCollaboratorAccess, getModuleKeyFromRoute } from '@/hooks/useCollaboratorAccess';
import { Loader2 } from 'lucide-react';

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
      toast.error('Acesso não liberado para este módulo');
      navigate('/dashboard', { replace: true });
    }
  }, [isLoading, isCollaborator, location.pathname, hasModuleAccess, navigate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
