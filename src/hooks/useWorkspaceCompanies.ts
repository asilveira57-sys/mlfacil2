import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CompanyOption {
  id: string;
  displayName: string;
}

/**
 * Fetches active companies from the `companies` table.
 * Used in the Notes pin-to-company selector.
 */
export function useWorkspaceCompanies() {
  const { data: companies = [], isLoading } = useQuery({
    queryKey: ['companies-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, display_name, is_active')
        .eq('is_active', true)
        .order('display_name');

      if (error) throw error;

      return (data || []).map((c: any) => ({
        id: c.id as string,
        displayName: c.display_name as string,
      }));
    },
    staleTime: 5 * 60 * 1000,
  });

  return { companies, isLoading };
}
