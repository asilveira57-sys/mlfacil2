import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface QaSettings {
  id: string;
  user_id: string;
  seller_id: string;
  greeting_template: string;
  signature_template: string;
  greeting_enabled: boolean;
  signature_enabled: boolean;
  created_at: string;
  updated_at: string;
}

const DEFAULT_SETTINGS: Partial<QaSettings> = {
  greeting_template: '{periodo_dia}! Obrigado pelo interesse.',
  signature_template: 'Atenciosamente, {nome_loja}.',
  greeting_enabled: true,
  signature_enabled: true,
};

export function useQaSettings(sellerId: string | null) {
  return useQuery({
    queryKey: ['qa-settings', sellerId],
    queryFn: async () => {
      if (!sellerId) return null;

      const { data, error } = await supabase
        .from('qa_settings')
        .select('*')
        .eq('seller_id', sellerId)
        .maybeSingle();

      if (error) throw error;
      return data as QaSettings | null;
    },
    enabled: !!sellerId,
  });
}

export function useUpsertQaSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: {
      seller_id: string;
      greeting_template: string;
      signature_template: string;
      greeting_enabled: boolean;
      signature_enabled: boolean;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: existing } = await supabase
        .from('qa_settings')
        .select('id')
        .eq('seller_id', data.seller_id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('qa_settings')
          .update({
            greeting_template: data.greeting_template,
            signature_template: data.signature_template,
            greeting_enabled: data.greeting_enabled,
            signature_enabled: data.signature_enabled,
          } as never)
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('qa_settings')
          .insert({
            user_id: user.id,
            seller_id: data.seller_id,
            greeting_template: data.greeting_template,
            signature_template: data.signature_template,
            greeting_enabled: data.greeting_enabled,
            signature_enabled: data.signature_enabled,
          } as never);
        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['qa-settings', variables.seller_id] });
      toast({
        title: 'Configurações salvas',
        description: 'As configurações de perguntas foram atualizadas',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao salvar',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Resolves dynamic variables in a template string
 */
export function resolveTemplate(
  template: string,
  context: {
    buyerName?: string | null;
    storeName?: string | null;
  }
): string {
  const hour = new Date().getHours();
  let periodo = 'Bom dia';
  if (hour >= 12 && hour < 18) periodo = 'Boa tarde';
  else if (hour >= 18 || hour < 6) periodo = 'Boa noite';

  return template
    .replace(/\{periodo_dia\}/g, periodo)
    .replace(/\{nome_cliente\}/g, context.buyerName || 'Cliente')
    .replace(/\{nome_loja\}/g, context.storeName || 'Nossa loja');
}

export { DEFAULT_SETTINGS as QA_DEFAULT_SETTINGS };
