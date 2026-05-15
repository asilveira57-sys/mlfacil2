import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface CollaboratorAccess {
  isCollaborator: boolean;
  isLoading: boolean;
  enabledModules: Set<string>;
  hasModuleAccess: (moduleKey: string) => boolean;
  refetch: () => Promise<void>;
}

// Dynamic route map cache
let cachedRouteMap: Map<string, string> | null = null;
let routeMapPromise: Promise<Map<string, string>> | null = null;

async function loadRouteMap(): Promise<Map<string, string>> {
  if (cachedRouteMap) return cachedRouteMap;
  if (routeMapPromise) return routeMapPromise;

  routeMapPromise = (async () => {
    const { data, error } = await supabase
      .from('system_modules')
      .select('key, route')
      .eq('is_active', true)
      .not('route', 'is', null);

    const map = new Map<string, string>();
    if (!error && data) {
      for (const m of data) {
        if (m.route) map.set(m.route, m.key);
      }
    }
    cachedRouteMap = map;
    // Invalidate cache after 5 minutes
    setTimeout(() => { cachedRouteMap = null; routeMapPromise = null; }, 5 * 60 * 1000);
    return map;
  })();

  return routeMapPromise;
}

/**
 * Hook to check if the current user is a collaborator and what modules they have access to.
 * Uses company_users + profile_permissions from the RBAC system.
 * Admins/owners have full access to all modules.
 */
export function useCollaboratorAccess(): CollaboratorAccess {
  const [isCollaborator, setIsCollaborator] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [enabledModules, setEnabledModules] = useState<Set<string>>(new Set());
  const initialLoadDoneRef = useRef(false);

  const fetchAccess = useCallback(async () => {
    try {
      if (!initialLoadDoneRef.current) {
        setIsLoading(true);
      }

      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        setIsCollaborator(false);
        setEnabledModules(new Set());
        setIsLoading(false);
        initialLoadDoneRef.current = true;
        return;
      }

      // Check global admin role first (super-admin bypass)
      const { data: roleData } = await supabase.rpc('get_user_role', { _user_id: user.id });
      if (roleData === 'admin') {
        setIsCollaborator(false);
        setEnabledModules(new Set(['__all__']));
        setIsLoading(false);
        initialLoadDoneRef.current = true;
        return;
      }

      // Check if user is a workspace admin (they have full access)
      const { data: memberData } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (memberData?.role === 'admin') {
        setIsCollaborator(false);
        setEnabledModules(new Set(['__all__']));
        setIsLoading(false);
        initialLoadDoneRef.current = true;
        return;
      }

      // Resolve the user's active company so we pick the correct company_users row.
      // A user can belong to multiple companies (e.g. their personal one + as collaborator).
      let activeCompanyId: string | null = null;
      try {
        const { data: ctx } = await supabase
          .from('user_context')
          .select('active_company_id')
          .eq('user_id', user.id)
          .maybeSingle();
        activeCompanyId = (ctx as any)?.active_company_id ?? null;
      } catch { /* ignore */ }

      // Check if user is a company_user with a profile, scoped to the active company when known.
      let companyUserQuery = supabase
        .from('company_users')
        .select('id, is_owner, profile_id, company_id')
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (activeCompanyId) {
        companyUserQuery = companyUserQuery.eq('company_id', activeCompanyId);
      }

      const { data: companyUsers } = await companyUserQuery;
      // Prefer the row matching active company; otherwise prefer non-owner (collaborator) row.
      const companyUser =
        companyUsers?.find(c => c.company_id === activeCompanyId)
        || companyUsers?.find(c => !c.is_owner)
        || companyUsers?.[0]
        || null;

      if (!companyUser) {
        setIsCollaborator(false);
        setEnabledModules(new Set(['__all__']));
        setIsLoading(false);
        initialLoadDoneRef.current = true;
        return;
      }

      if (companyUser.is_owner) {
        setIsCollaborator(false);
        setEnabledModules(new Set(['__all__']));
        setIsLoading(false);
        initialLoadDoneRef.current = true;
        return;
      }

      // User is a collaborator - check their profile permissions
      setIsCollaborator(true);

      if (!companyUser.profile_id) {
        setEnabledModules(new Set(['dashboard']));
        setIsLoading(false);
        initialLoadDoneRef.current = true;
        return;
      }

      // Fetch permissions for the user's profile where action is 'view'
      const { data: permsData } = await supabase
        .from('profile_permissions')
        .select(`
          allowed,
          feature:system_features!inner(
            module:system_modules!inner(key),
            action:system_actions!inner(key)
          )
        `)
        .eq('profile_id', companyUser.profile_id)
        .eq('allowed', true);

      const modules = new Set<string>();
      modules.add('dashboard');

      if (permsData) {
        for (const perm of permsData) {
          const feature = perm.feature as any;
          if (feature?.action?.key === 'view' && feature?.module?.key) {
            modules.add(feature.module.key);
          }
        }
      }

      setEnabledModules(modules);
    } catch (err) {
      console.error('[useCollaboratorAccess] Error:', err);
      if (!initialLoadDoneRef.current) {
        setIsCollaborator(false);
        setEnabledModules(new Set(['__all__']));
      }
    } finally {
      setIsLoading(false);
      initialLoadDoneRef.current = true;
    }
  }, []);

  useEffect(() => {
    fetchAccess();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') fetchAccess();
    });

    return () => subscription.unsubscribe();
  }, [fetchAccess]);

  const hasModuleAccess = useCallback((moduleKey: string): boolean => {
    if (!isCollaborator) return true;
    if (enabledModules.has('__all__')) return true;
    return enabledModules.has(moduleKey);
  }, [isCollaborator, enabledModules]);

  return {
    isCollaborator,
    isLoading,
    enabledModules,
    hasModuleAccess,
    refetch: fetchAccess,
  };
}

/**
 * Dynamic reverse lookup: route → module key.
 * Uses the DB-backed route map instead of hardcoded values.
 */
export async function getModuleKeyFromRoute(route: string): Promise<string | null> {
  const routeMap = await loadRouteMap();
  
  // Exact match first
  const exact = routeMap.get(route);
  if (exact) return exact;

  // Prefix match (e.g. /tarefas/quadro → /tarefas)
  for (const [routePath, moduleKey] of routeMap) {
    if (route.startsWith(routePath + '/')) {
      return moduleKey;
    }
  }

  return null;
}

/**
 * Synchronous version for components that already have the route map.
 * Falls back to null if map isn't loaded yet.
 */
export function getModuleKeyFromRouteSync(route: string): string | null {
  if (!cachedRouteMap) return null;
  
  const exact = cachedRouteMap.get(route);
  if (exact) return exact;

  for (const [routePath, moduleKey] of cachedRouteMap) {
    if (route.startsWith(routePath + '/')) {
      return moduleKey;
    }
  }

  return null;
}
