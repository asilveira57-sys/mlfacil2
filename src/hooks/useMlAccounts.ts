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
  access_token?: string;
  refresh_token?: string;
  token_expires_at: string;
  connection_status?: string;
  is_inherited?: boolean;
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
      
      // Use the same source as ActiveAccountContext so collaborators inherit the
      // titular ML token instead of looking disconnected because ml_accounts.user_id
      // belongs to the owner.
      const { data, error } = await supabase.rpc('get_accessible_ml_accounts');

      if (error) throw error;
      const accounts = ((data || []) as MlAccount[]).filter((account) => {
        if (!onlyConnected) return true;
        return account.is_connected && ['connected', 'attention'].includes(account.connection_status || '');
      });

      return accounts.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    },
    enabled: !!userId,
  });
}
