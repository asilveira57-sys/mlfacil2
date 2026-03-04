import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface EmailCampaign {
  id: string;
  name: string;
  description: string | null;
  template_id: string;
  status: string;
  audience_json: Record<string, unknown>;
  variables_default: Record<string, unknown>;
  throttle_per_minute: number;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  open_count: number;
  click_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  template_name?: string;
}

export function useEmailCampaigns() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['admin', 'email-campaigns'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('email_campaigns')
        .select('*, email_templates(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((c: any) => ({
        ...c,
        template_name: c.email_templates?.name,
        email_templates: undefined,
      })) as EmailCampaign[];
    },
  });

  const createCampaign = useMutation({
    mutationFn: async (campaign: Partial<EmailCampaign>) => {
      const { data, error } = await (supabase as any)
        .from('email_campaigns')
        .insert(campaign)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'email-campaigns'] });
      toast.success('Campanha criada');
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const updateCampaign = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<EmailCampaign> & { id: string }) => {
      const { template_name, ...clean } = updates as any;
      const { data, error } = await (supabase as any)
        .from('email_campaigns')
        .update(clean)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'email-campaigns'] });
      toast.success('Campanha atualizada');
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const campaignAction = useMutation({
    mutationFn: async ({ campaign_id, action }: { campaign_id: string; action: string }) => {
      const { data, error } = await supabase.functions.invoke('email-campaign-send', {
        body: { campaign_id, action },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'email-campaigns'] });
      const msgs: Record<string, string> = {
        build_recipients: `Audiência construída: ${data?.total_recipients || 0} destinatários`,
        send: `Campanha enviada: ${data?.sent || 0} enfileirados`,
        pause: 'Campanha pausada',
        cancel: 'Campanha cancelada',
      };
      toast.success(msgs[variables.action] || 'Ação executada');
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  return { ...query, createCampaign, updateCampaign, campaignAction };
}
