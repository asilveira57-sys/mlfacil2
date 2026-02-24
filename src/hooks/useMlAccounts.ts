import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState, useEffect } from 'react';

export interface MlAccount {
  id: string;
  user_id: string;
  ml_user_id: string;
  nickname: string | null;
  email: string | null;
  is_active: boolean;
  is_connected: boolean;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  connection_status?: string;
  created_at: string;
  updated_at: string;
}

export interface UseMlAccountsOptions {
  /**
   * If true, only returns accounts with connection_status in ('connected', 'attention')
   * Default: false (returns all accounts for the user)
   */
  onlyConnected?: boolean;
}

export function useMlAccounts(options: UseMlAccountsOptions = {}) {
  const { onlyConnected = false } = options;
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id || null);
    });
  }, []);

  return useQuery({
    queryKey: ['ml-accounts', userId, onlyConnected],
    queryFn: async (): Promise<MlAccount[]> => {
      if (!userId) return [];
      
      let query = supabase
        .from('ml_accounts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      // Only filter by connection_status if explicitly requested
      // Do NOT filter by is_active - that flag is for "enabled/disabled" not "selected"
      if (onlyConnected) {
        query = query.eq('is_connected', true)
          .in('connection_status', ['connected', 'attention']);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as MlAccount[];
    },
    enabled: !!userId,
  });
}
