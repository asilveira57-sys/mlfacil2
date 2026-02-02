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
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  created_at: string;
  updated_at: string;
}

export function useMlAccounts() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id || null);
    });
  }, []);

  return useQuery({
    queryKey: ['ml-accounts', userId],
    queryFn: async (): Promise<MlAccount[]> => {
      if (!userId) return [];
      
      const { data, error } = await supabase
        .from('ml_accounts')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as MlAccount[];
    },
    enabled: !!userId,
  });
}
