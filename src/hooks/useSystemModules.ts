import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ROUTE_MODULE_MAP, MODULE_LABELS } from '@/hooks/useActiveModuleKey';

export interface SystemModule {
  key: string;
  label: string;
  iconName?: string;
}

/** Static fallback derived from ROUTE_MODULE_MAP */
function getStaticModules(): SystemModule[] {
  return Object.values(ROUTE_MODULE_MAP).map((key) => ({
    key,
    label: MODULE_LABELS[key] || key,
  }));
}

export function useSystemModules() {
  const { data: modules = [], isLoading } = useQuery({
    queryKey: ['system-modules-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_modules')
        .select('id, name, icon_name, route, is_active')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;

      return (data || []).map((m: any) => ({
        key: m.id as string,
        label: m.name as string,
        iconName: m.icon_name as string | undefined,
      }));
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    // On error, React Query won't populate data, so we handle fallback below
  });

  // If query returned empty or failed, use static fallback
  const effectiveModules = modules.length > 0 ? modules : getStaticModules();

  return { modules: effectiveModules, isLoading };
}
