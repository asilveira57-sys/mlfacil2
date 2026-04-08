import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface MlAccountInfo {
  id: string;
  nickname: string | null;
  ml_user_id: string;
  connection_status: string | null;
  is_active: boolean;
  created_at: string | null;
  last_activity_at: string | null;
}

export interface AdminClient {
  user_id: string;
  full_name: string | null;
  email: string | null;
  whatsapp: string | null;
  cpf: string | null;
  photo_url: string | null;
  profile_created_at: string;
  // access state
  onboarding_status: string | null;
  trial_status: string | null;
  trial_start_at: string | null;
  trial_end_at: string | null;
  selected_plan_id: string | null;
  payment_status: string | null;
  ml_account_connected: boolean | null;
  last_sign_in_at: string | null;
  last_activity_at: string | null;
  // company
  company_id: string | null;
  company_name: string | null;
  company_document: string | null;
  company_city: string | null;
  company_state: string | null;
  // aggregated
  ml_accounts: MlAccountInfo[];
  roles: string[];
  tag: string | null;
  plan_name: string | null;
}

export function useAdminClients() {
  return useQuery({
    queryKey: ['admin', 'clients'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_clients_overview');
      if (error) throw error;
      return (data || []) as unknown as AdminClient[];
    },
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (targetUserId: string) => {
      const { data, error } = await supabase.functions.invoke('admin-delete-user', {
        body: { target_user_id: targetUserId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'clients'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success('Cliente excluído com sucesso');
    },
    onError: (error) => {
      toast.error(`Erro ao excluir cliente: ${error.message}`);
    },
  });
}
