import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SystemModule {
  key: string;
  label: string;
  iconName?: string;
}

export function useSystemModules() {
  const { data: modules = [], isLoading } = useQuery({
    queryKey: ['system-modules-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_modules')
        .select('id, key, name, icon_key, route, is_active')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;

      return (data || []).map((m) => ({
        key: m.key,
        label: m.name,
        iconName: m.icon_key || undefined,
      }));
    },
    staleTime: 5 * 60 * 1000,
  });

  return { modules, isLoading };
}
