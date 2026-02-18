import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface UserContext {
  activeCompanyId: string | null;
  activeMarketplaceAccountId: string | null;
}

export function useUserContext(): UserContext {
  const { data } = useQuery({
    queryKey: ['user-context'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data: ctx } = await supabase
        .from('user_context')
        .select('active_company_id, active_marketplace_account_id')
        .eq('user_id', user.id)
        .single();

      return ctx;
    },
    staleTime: 5 * 60 * 1000,
  });

  return {
    activeCompanyId: data?.active_company_id ?? null,
    activeMarketplaceAccountId: data?.active_marketplace_account_id ?? null,
  };
}
