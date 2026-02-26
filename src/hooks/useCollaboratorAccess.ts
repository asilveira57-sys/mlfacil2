import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface CollaboratorAccess {
  isCollaborator: boolean;
  isLoading: boolean;
  enabledModules: Set<string>;
  hasModuleAccess: (moduleKey: string) => boolean;
  refetch: () => Promise<void>;
}

/**
 * Hook to check if the current user is a collaborator and what modules they have access to.
 * Now uses company_users + profile_permissions from the new RBAC system.
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

      // Check if user is a company_user with a profile
      const { data: companyUser } = await supabase
        .from('company_users')
        .select('id, is_owner, profile_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!companyUser) {
        // Not a company user, treat as owner/admin with full access
        setIsCollaborator(false);
        setEnabledModules(new Set(['__all__']));
        setIsLoading(false);
        initialLoadDoneRef.current = true;
        return;
      }

      if (companyUser.is_owner) {
        // Owner has full access
        setIsCollaborator(false);
        setEnabledModules(new Set(['__all__']));
        setIsLoading(false);
        initialLoadDoneRef.current = true;
        return;
      }

      // User is a collaborator - check their profile permissions
      setIsCollaborator(true);

      if (!companyUser.profile_id) {
        // No profile assigned, minimal access
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
      setIsCollaborator(true);
      setEnabledModules(new Set(['dashboard']));
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

// Module key to route path mapping for guards
export const MODULE_ROUTE_MAP: Record<string, string[]> = {
  dashboard: ['/dashboard'],
  'marketplace.sales.shipping': ['/shipping-labels'],
  'operational.labels': ['/shipping-labels', '/shipping-labels/header-settings'],
  'marketplace.sales.orders': ['/vendas'],
  'operational.tasks': ['/tarefas', '/tarefas/quadro', '/tarefas/inbox', '/tarefas/regras'],
  'marketplace.campaigns': ['/promocoes'],
  'marketplace.ads': ['/publicidade'],
  'marketplace.listings.timeline': ['/anuncios/linha-do-tempo', '/anuncios/acoes'],
  'marketplace.aftersales': ['/mensagens'],
  'marketplace.questions': ['/perguntas'],
  'marketplace.listings.diagnostics': ['/radiografia'],
  'tools.market_explorer': ['/mercado'],
  'tools.trends': ['/tendencias'],
  'operational.products.abc': ['/abc-analysis'],
  'operational.products.costs': ['/custos'],
  'marketplace.pricing': ['/precificacao'],
  'marketplace.shipping': ['/frete'],
  'tools.competitors': ['/concorrencia'],
  'wholesale': ['/atacado'],
};

// Reverse lookup: route to module key
export function getModuleKeyFromRoute(route: string): string | null {
  for (const [moduleKey, routes] of Object.entries(MODULE_ROUTE_MAP)) {
    if (routes.some(r => route === r || route.startsWith(r + '/'))) {
      return moduleKey;
    }
  }
  return null;
}
