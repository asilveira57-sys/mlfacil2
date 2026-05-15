import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useCollaboratorAccess, getModuleKeyFromRouteSync } from '@/hooks/useCollaboratorAccess';
import { useModuleRouteMap } from '@/hooks/useSystemModules';
import { useCanAccessModule } from '@/hooks/useCanAccessModule';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import { ModuleAccessDenied } from './ModuleAccessDenied';

interface ModuleAccessGuardProps {
  children: React.ReactNode;
}

const PUBLIC_ROUTE_PREFIXES = [
  '/home',
  '/auth',
  '/reset-password',
  '/criar-acesso',
  '/verificar',
  '/primeiro-acesso',
  '/reconnecting',
  '/sincronizando',
  '/planos',
  '/blog',
  '/consultoria',
  '/termos-de-uso',
  '/politica-de-privacidade',
  '/politica-de-cookies',
  '/lgpd',
  '/modulo',
  '/dica',
  '/ferramentas',
  '/status',
  '/contato',
  '/suporte',
  '/central-de-ajuda',
];

/**
 * Route guard component that checks if the current user has access to the current route.
 * If they don't have access (collaborator without module permission), redirects to dashboard.
 */
export function ModuleAccessGuard({ children }: ModuleAccessGuardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isCollaborator, isLoading, hasModuleAccess } = useCollaboratorAccess();
  const { data: routeMap } = useModuleRouteMap();
  const { canAccessModule, hasPlanConfig, isLoading: planLoading } = useCanAccessModule();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [timedOut, setTimedOut] = useState(false);
  const [planBlocked, setPlanBlocked] = useState(false);
  const hasResolvedOnceRef = useRef(false);

  const combinedLoading = isLoading || planLoading || roleLoading;
  const isPublicRoute =
    location.pathname === '/' ||
    PUBLIC_ROUTE_PREFIXES.some((prefix) =>
      location.pathname === prefix || location.pathname.startsWith(`${prefix}/`),
    );
  const isAdminRoute = location.pathname === '/admin' || location.pathname.startsWith('/admin/');

  useEffect(() => {
    if (!combinedLoading) hasResolvedOnceRef.current = true;
  }, [combinedLoading]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.info('[MOUNT] ModuleAccessGuard');
    return () => { console.info('[UNMOUNT] ModuleAccessGuard'); };
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.info('[NAV] ModuleAccessGuard', location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    if (!combinedLoading) {
      setTimedOut(false);
      return;
    }
    setTimedOut(false);
    const t = window.setTimeout(() => {
      console.warn('[ModuleAccessGuard] Permission check timed out after 5s, failing open');
      setTimedOut(true);
    }, 5_000);
    return () => window.clearTimeout(t);
  }, [combinedLoading, location.pathname]);

  // Pre-warm the route map cache
  useEffect(() => {
    if (routeMap) {
      import('@/hooks/useCollaboratorAccess').then(m => m.getModuleKeyFromRoute('/'));
    }
  }, [routeMap]);

  // Reset plan blocked state on route change
  useEffect(() => {
    setPlanBlocked(false);
  }, [location.pathname]);

  useEffect(() => {
    if (isPublicRoute || isAdminRoute || isAdmin) {
      setPlanBlocked(false);
      return;
    }

    if (combinedLoading) return;

    const moduleKey = getModuleKeyFromRouteSync(location.pathname);

    const internalBypassRoutes = ['/dashboard', '/settings'];
    if (internalBypassRoutes.includes(location.pathname)) return;

    if (!moduleKey) return;

    // 1. Collaborator RBAC check
    if (isCollaborator && !hasModuleAccess(moduleKey)) {
      if (import.meta.env.DEV) {
        console.warn('[ACCESS] collaborator blocked route', { moduleKey, pathname: location.pathname });
      }
      toast.error('Acesso não liberado para este módulo');
      navigate('/dashboard', { replace: true });
      return;
    }

    // 2. Plan-based module check
    if (hasPlanConfig && !canAccessModule(moduleKey)) {
      if (import.meta.env.DEV) {
        console.warn('[ACCESS] plan blocked route', { moduleKey, pathname: location.pathname });
      }
      setPlanBlocked(true);
      return;
    }
  }, [combinedLoading, isCollaborator, isAdmin, location.pathname, hasModuleAccess, canAccessModule, hasPlanConfig, navigate, isPublicRoute, isAdminRoute]);

  // Show friendly 403 screen for plan-blocked modules
  if (planBlocked) {
    return <ModuleAccessDenied />;
  }

  if (isPublicRoute || isAdminRoute || isAdmin) {
    return <>{children}</>;
  }

  if (combinedLoading || timedOut || hasResolvedOnceRef.current) {
    return <>{children}</>;
  }

  return <>{children}</>;
}
