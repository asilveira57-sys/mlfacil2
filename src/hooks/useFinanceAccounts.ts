import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState, useEffect } from 'react';
import { invokeEdgeFunction } from '@/lib/edgeFunctionClient';

export interface FinanceAccount {
  id: string;
  user_id: string;
  company_id: string | null;
  ml_account_id: string | null;
  mp_user_id: string;
  nickname: string | null;
  email: string | null;
  connection_status: string;
  is_active: boolean;
  token_expires_at: string | null;
  last_api_ok_at: string | null;
  last_api_error_code: string | null;
  consecutive_failures: number;
  created_at: string;
  updated_at: string;
}

export function useFinanceAccounts() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id || null);
    });
  }, []);

  return useQuery({
    queryKey: ['finance-accounts', userId],
    queryFn: async (): Promise<FinanceAccount[]> => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('finance_accounts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as FinanceAccount[];
    },
    enabled: !!userId,
  });
}

export function useConnectMpAccount() {
  return useMutation({
    mutationFn: async (params: { ml_account_id?: string; companyId?: string }) => {
      const result = await invokeEdgeFunction<{ authUrl: string }>('mp-auth-url', {
        body: {
          frontendOrigin: window.location.origin,
          ml_account_id: params.ml_account_id || '',
          companyId: params.companyId || '',
        },
      });

      if (!result.success || !result.data?.authUrl) {
        throw new Error(result.error || 'Erro ao gerar URL de autorização');
      }

      // Redirect to MP OAuth
      window.location.href = result.data.authUrl;
    },
  });
}

export function useRefreshMpToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (financeAccountId: string) => {
      const result = await invokeEdgeFunction<{ success: boolean }>('mp-token-refresh', {
        body: { financeAccountId },
      });

      if (!result.success) {
        throw new Error(result.error || 'Erro ao renovar token');
      }

      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance-accounts'] });
    },
  });
}
