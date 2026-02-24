import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

type CampaignAction = 'pause_campaign' | 'activate_campaign' | 'pause_ad' | 'activate_ad' | 'add_ad' | 'remove_ad';

interface ActionResult {
  success: boolean;
  error?: string;
  details?: string;
}

export function useAdsCampaignActions(sellerId?: string) {
  const [loading, setLoading] = useState<string | null>(null); // tracks which action is loading
  const queryClient = useQueryClient();

  const executeAction = useCallback(async (
    action: CampaignAction,
    opts: { campaign_id?: string; item_id?: string },
  ): Promise<ActionResult> => {
    if (!sellerId) return { success: false, error: 'No seller ID' };

    const actionKey = `${action}:${opts.campaign_id || opts.item_id}`;
    setLoading(actionKey);

    try {
      const { data, error } = await supabase.functions.invoke('ads-campaign-manage', {
        body: {
          seller_id: sellerId,
          action,
          campaign_id: opts.campaign_id,
          item_id: opts.item_id,
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.details || data.error);

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['ads-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['ads-items'] });

      return { success: true };
    } catch (err: any) {
      const msg = err?.message || 'Erro ao executar ação';
      console.error(`[useAdsCampaignActions] ${action} failed:`, msg);
      return { success: false, error: msg };
    } finally {
      setLoading(null);
    }
  }, [sellerId, queryClient]);

  const pauseCampaign = useCallback(async (campaignId: string) => {
    const result = await executeAction('pause_campaign', { campaign_id: campaignId });
    if (result.success) {
      toast.success('Campanha pausada com sucesso');
    } else {
      toast.error('Erro ao pausar campanha', { description: result.error });
    }
    return result;
  }, [executeAction]);

  const activateCampaign = useCallback(async (campaignId: string) => {
    const result = await executeAction('activate_campaign', { campaign_id: campaignId });
    if (result.success) {
      toast.success('Campanha ativada com sucesso');
    } else {
      toast.error('Erro ao ativar campanha', { description: result.error });
    }
    return result;
  }, [executeAction]);

  const pauseAd = useCallback(async (itemId: string) => {
    const result = await executeAction('pause_ad', { item_id: itemId });
    if (result.success) {
      toast.success('Anúncio pausado com sucesso');
    } else {
      toast.error('Erro ao pausar anúncio', { description: result.error });
    }
    return result;
  }, [executeAction]);

  const activateAd = useCallback(async (itemId: string) => {
    const result = await executeAction('activate_ad', { item_id: itemId });
    if (result.success) {
      toast.success('Anúncio ativado com sucesso');
    } else {
      toast.error('Erro ao ativar anúncio', { description: result.error });
    }
    return result;
  }, [executeAction]);

  const addAd = useCallback(async (campaignId: string, itemId: string) => {
    const result = await executeAction('add_ad', { campaign_id: campaignId, item_id: itemId });
    if (result.success) {
      toast.success('Produto adicionado à campanha');
    } else {
      toast.error('Erro ao adicionar produto', { description: result.error });
    }
    return result;
  }, [executeAction]);

  const removeAd = useCallback(async (itemId: string) => {
    const result = await executeAction('remove_ad', { item_id: itemId });
    if (result.success) {
      toast.success('Produto removido da campanha');
    } else {
      toast.error('Erro ao remover produto', { description: result.error });
    }
    return result;
  }, [executeAction]);

  return {
    pauseCampaign,
    activateCampaign,
    pauseAd,
    activateAd,
    addAd,
    removeAd,
    loading,
    isLoading: loading !== null,
  };
}
