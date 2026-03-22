import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useCollaboratorAccess, getModuleKeyFromRouteSync } from '@/hooks/useCollaboratorAccess';
import { useModuleRouteMap } from '@/hooks/useSystemModules';
import { useCanAccessModule } from '@/hooks/useCanAccessModule';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModuleAccessDenied } from './ModuleAccessDenied';

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
  const { data: routeMap } = useModuleRouteMap();
  const [timedOut, setTimedOut] = useState(false);
  // Prevent full-screen "blank" on background refetches.
  // Once access has been resolved at least once, keep rendering children
  // even if the underlying hook briefly flips to loading.
  const hasResolvedOnceRef = useRef(false);

  useEffect(() => {
    if (!isLoading) hasResolvedOnceRef.current = true;
  }, [isLoading]);

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
    // Fail-open after 5s — RLS still protects data server-side
    const t = window.setTimeout(() => {
      console.warn('[ModuleAccessGuard] Permission check timed out after 5s, failing open');
      setTimedOut(true);
    }, 5_000);
    return () => window.clearTimeout(t);
  }, [isLoading, location.pathname]);

  // Pre-warm the route map cache for getModuleKeyFromRouteSync
  useEffect(() => {
    if (routeMap) {
      // routeMap from useModuleRouteMap populates the react-query cache;
      // but getModuleKeyFromRouteSync uses its own module-level cache.
      // We trigger loadRouteMap to populate it.
      import('@/hooks/useCollaboratorAccess').then(m => m.getModuleKeyFromRoute('/'));
    }
  }, [routeMap]);

  useEffect(() => {
    if (isLoading) return;
    if (!isCollaborator) return; // Admin/owner has full access

    const moduleKey = getModuleKeyFromRouteSync(location.pathname);
    
    // Routes that don't require module access check
    const publicRoutes = ['/dashboard', '/settings', '/auth', '/criar-acesso', '/primeiro-acesso', '/reconnecting', '/'];
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
    // If we already resolved once, never block the entire app frame.
    if (hasResolvedOnceRef.current) {
      return <>{children}</>;
    }

    // Fail-open on timeout: render children, RLS protects data server-side
    if (timedOut) {
      return <>{children}</>;
    }

    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
