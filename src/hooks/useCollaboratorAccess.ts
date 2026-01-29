import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { MODULE_CATALOG } from '@/types/collaborator';

interface CollaboratorAccess {
  isCollaborator: boolean;
  isLoading: boolean;
  enabledModules: Set<string>;
  hasModuleAccess: (moduleKey: string) => boolean;
  refetch: () => Promise<void>;
}

/**
 * Hook to check if the current user is a collaborator and what modules they have access to.
 * Admins/owners have full access to all modules.
 * Collaborators only have access to enabled modules.
 */
export function useCollaboratorAccess(): CollaboratorAccess {
  const [isCollaborator, setIsCollaborator] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [enabledModules, setEnabledModules] = useState<Set<string>>(new Set());
  // Only block UI on the very first load; subsequent refetches must be silent.
  const initialLoadDoneRef = useRef(false);

  const fetchAccess = useCallback(async () => {
    try {
      if (!initialLoadDoneRef.current) {
        setIsLoading(true);
      }

      // IMPORTANT: getSession() is local-cache and avoids a network call.
      // getUser() can block on network and can be triggered again on tab focus.
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
        // Admin has all access
        setIsCollaborator(false);
        const allModules = new Set(MODULE_CATALOG.map(m => m.key));
        setEnabledModules(allModules);
        setIsLoading(false);
        initialLoadDoneRef.current = true;
        return;
      }

      // Check if user is a collaborator
      const { data: collabData } = await supabase
        .from('collaborators')
        .select('id, status')
        .eq('auth_user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (!collabData) {
        // Not a collaborator, might be a regular workspace member
        setIsCollaborator(false);
        const allModules = new Set(MODULE_CATALOG.map(m => m.key));
        setEnabledModules(allModules);
        setIsLoading(false);
        initialLoadDoneRef.current = true;
        return;
      }

      // User is a collaborator - fetch their module access
      setIsCollaborator(true);

      const { data: modulesData } = await supabase
        .from('collaborator_module_access')
        .select('module_key, enabled')
        .eq('collaborator_id', collabData.id)
        .eq('enabled', true);

      const modules = new Set<string>();
      (modulesData || []).forEach(m => {
        if (m.enabled) {
          modules.add(m.module_key);
        }
      });

      // Always include dashboard for collaborators
      modules.add('dashboard');

      setEnabledModules(modules);
    } catch (err) {
      console.error('[useCollaboratorAccess] Error:', err);
      // On error, default to no access for safety
      setIsCollaborator(true);
      setEnabledModules(new Set(['dashboard']));
    } finally {
      setIsLoading(false);
      initialLoadDoneRef.current = true;
    }
  }, []);

  useEffect(() => {
    fetchAccess();

    // Listen for auth changes - ONLY on actual session changes
    // Ignoring TOKEN_REFRESHED prevents tab-switch flickering
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      // Only react to SIGNED_OUT.
      // SIGNED_IN can be emitted unexpectedly in some edge cases and would
      // cause a full-screen guard spinner that looks like a page reload.
      if (event === 'SIGNED_OUT') fetchAccess();
      // TOKEN_REFRESHED and INITIAL_SESSION are ignored
    });

    return () => subscription.unsubscribe();
  }, [fetchAccess]);

  const hasModuleAccess = useCallback((moduleKey: string): boolean => {
    // If not a collaborator (admin/owner), they have full access
    if (!isCollaborator) return true;
    // Check if module is in enabled set
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
  vendas: ['/shipping-labels'],
  etiquetas: ['/shipping-labels', '/shipping-labels/header-settings'],
  tarefas: ['/tarefas', '/tarefas/quadro', '/tarefas/inbox', '/tarefas/regras'],
  promocoes: ['/promocoes'],
  mercado_ads: ['/publicidade'],
  linha_do_tempo: ['/anuncios/linha-do-tempo', '/anuncios/acoes'],
  pos_venda: ['/mensagens'],
  perguntas: ['/perguntas'],
  radiografia: ['/radiografia'],
  mercado: ['/mercado'],
  tendencias: ['/tendencias'],
  abc: ['/abc-analysis'],
  custos: ['/custos'],
  concorrencia: ['/concorrencia'],
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
