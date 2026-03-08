import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SystemModule {
  key: string;
  label: string;
  iconName?: string;
  route?: string;
  description?: string;
  isInternalOnly?: boolean;
}

export function useSystemModules() {
  const { data: modules = [], isLoading } = useQuery({
    queryKey: ['system-modules-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_modules')
        .select('id, key, name, icon_key, route, is_active, is_internal_only, description')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;

      return (data || []).map((m) => ({
        key: m.key,
        label: m.name,
        iconName: m.icon_key || undefined,
        route: m.route || undefined,
        description: (m as any).description || undefined,
        isInternalOnly: m.is_internal_only || false,
      }));
    },
    staleTime: 5 * 60 * 1000,
  });

  return { modules, isLoading };
}

/**
 * Hook specifically for the collaborator/permissions UI.
 * Returns only non-internal leaf modules (with routes).
 */
export function usePermissionModules() {
  return useQuery({
    queryKey: ['permission-modules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_modules')
        .select('key, name, description, is_internal_only, route, sort_order')
        .eq('is_active', true)
        .eq('is_internal_only', false)
        .not('route', 'is', null)
        .order('sort_order');

      if (error) throw error;

      return (data || []).map((m) => ({
        key: m.key,
        label: m.name,
        description: (m as any).description || undefined,
        route: m.route,
      }));
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to build a dynamic route-to-module-key map from the DB.
 */
export function useModuleRouteMap() {
  return useQuery({
    queryKey: ['module-route-map'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_modules')
        .select('key, route')
        .eq('is_active', true)
        .not('route', 'is', null);

      if (error) throw error;

      const routeToModule = new Map<string, string>();
      for (const m of data || []) {
        if (m.route) {
          routeToModule.set(m.route, m.key);
        }
      }
      return routeToModule;
    },
    staleTime: 5 * 60 * 1000,
  });
}
