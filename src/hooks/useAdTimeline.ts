import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type {
  AdTimelineStats,
  AdTimelineEvent,
  AdLifecycleAction,
  AdLifecycleExperiment,
  AdTimelineSettings,
  TimelineFilters,
  BucketCounts,
  StatusBucket,
  ActionType,
  CloneChecklist,
} from '@/types/ad-timeline';

const BUCKET_ORDER: StatusBucket[] = ['120D', '90D', '60D', '30D', 'NO_SALES', 'OK'];

export function useAdTimelineStats(workspaceId: string | null, filters: TimelineFilters) {
  return useQuery({
    queryKey: ['ad-timeline-stats', workspaceId, filters],
    queryFn: async () => {
      if (!workspaceId) return [];

      let query = supabase
        .from('ad_timeline_stats')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('days_since_last_sale', { ascending: false, nullsFirst: true });

      if (filters.ml_account_id) {
        query = query.eq('ml_account_id', filters.ml_account_id);
      }
      if (filters.status_bucket && filters.status_bucket !== 'ALL') {
        query = query.eq('status_bucket', filters.status_bucket);
      }

      const { data, error } = await query.limit(500);

      if (error) {
        console.error('[useAdTimelineStats] Error:', error);
        throw error;
      }

      // Enrich with listing data
      const itemIds = data?.map(s => s.item_id) || [];
      if (itemIds.length > 0) {
        const { data: listings } = await supabase
          .from('meli_listings_cache')
          .select('item_id, title, thumbnail, price, status')
          .in('item_id', itemIds);

        const listingMap = new Map(listings?.map(l => [l.item_id, l]) || []);
        return data?.map(stat => ({
          ...stat,
          ...listingMap.get(stat.item_id),
        })) as AdTimelineStats[];
      }

      return (data || []) as AdTimelineStats[];
    },
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useAdTimelineBucketCounts(workspaceId: string | null, mlAccountId?: string) {
  return useQuery({
    queryKey: ['ad-timeline-bucket-counts', workspaceId, mlAccountId],
    queryFn: async (): Promise<BucketCounts> => {
      if (!workspaceId) {
        return { OK: 0, '30D': 0, '60D': 0, '90D': 0, '120D': 0, NO_SALES: 0, total: 0 };
      }

      let query = supabase
        .from('ad_timeline_stats')
        .select('status_bucket')
        .eq('workspace_id', workspaceId);

      if (mlAccountId) {
        query = query.eq('ml_account_id', mlAccountId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const counts: BucketCounts = { OK: 0, '30D': 0, '60D': 0, '90D': 0, '120D': 0, NO_SALES: 0, total: 0 };
      data?.forEach(row => {
        const bucket = row.status_bucket as StatusBucket;
        if (counts[bucket] !== undefined) {
          counts[bucket]++;
        }
        counts.total++;
      });

      return counts;
    },
    enabled: !!workspaceId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useAdTimelineEvents(workspaceId: string | null, itemId: string | null) {
  return useQuery({
    queryKey: ['ad-timeline-events', workspaceId, itemId],
    queryFn: async () => {
      if (!workspaceId || !itemId) return [];

      const { data, error } = await supabase
        .from('ad_timeline_events')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('item_id', itemId)
        .order('occurred_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data || []) as AdTimelineEvent[];
    },
    enabled: !!workspaceId && !!itemId,
  });
}

export function useAdTimelineItemDetail(workspaceId: string | null, itemId: string | null) {
  return useQuery({
    queryKey: ['ad-timeline-item-detail', workspaceId, itemId],
    queryFn: async () => {
      if (!workspaceId || !itemId) return null;

      const { data, error } = await supabase
        .from('ad_timeline_stats')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('item_id', itemId)
        .single();

      if (error) throw error;

      // Enrich with listing data
      const { data: listing } = await supabase
        .from('meli_listings_cache')
        .select('*')
        .eq('item_id', itemId)
        .single();

      return {
        ...data,
        ...(listing || {}),
      } as AdTimelineStats & Record<string, any>;
    },
    enabled: !!workspaceId && !!itemId,
  });
}

export function useAdLifecycleActions(workspaceId: string | null, statusFilter?: string) {
  return useQuery({
    queryKey: ['ad-lifecycle-actions', workspaceId, statusFilter],
    queryFn: async () => {
      if (!workspaceId) return [];

      let query = supabase
        .from('ad_lifecycle_actions')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('updated_at', { ascending: false });

      if (statusFilter) {
        const statuses = statusFilter.split(',');
        query = query.in('action_status', statuses);
      }

      const { data, error } = await query.limit(200);

      if (error) throw error;
      return (data || []) as AdLifecycleAction[];
    },
    enabled: !!workspaceId,
  });
}

export function useAdTimelineSettings(workspaceId: string | null) {
  return useQuery({
    queryKey: ['ad-timeline-settings', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return null;

      const { data, error } = await supabase
        .from('ad_timeline_settings')
        .select('*')
        .eq('workspace_id', workspaceId)
        .maybeSingle();

      if (error) throw error;
      return data as AdTimelineSettings | null;
    },
    enabled: !!workspaceId,
  });
}

export function useRecalculateTimeline() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ workspaceId, mlAccountId }: { workspaceId: string; mlAccountId?: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await supabase.functions.invoke('ad-timeline-recalculate', {
        body: { workspace_id: workspaceId, ml_account_id: mlAccountId },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ad-timeline-stats'] });
      queryClient.invalidateQueries({ queryKey: ['ad-timeline-bucket-counts'] });
      toast({
        title: 'Recálculo concluído',
        description: `${data.processed} anúncios processados`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro no recálculo',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useCreateAction() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      workspaceId,
      mlAccountId,
      itemId,
      actionType,
      reason,
      checklist,
    }: {
      workspaceId: string;
      mlAccountId: string;
      itemId: string;
      actionType: ActionType;
      reason?: string;
      checklist?: CloneChecklist;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('ad_lifecycle_actions')
        .insert([{
          workspace_id: workspaceId,
          ml_account_id: mlAccountId,
          item_id: itemId,
          action_type: actionType,
          action_status: 'DRAFT',
          reason: reason || `SEM_VENDA`,
          checklist: (checklist || {}) as Record<string, any>,
          created_by: user?.id,
        }])
        .select()
        .single();

      if (error) throw error;
      return data as AdLifecycleAction;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad-lifecycle-actions'] });
      toast({
        title: 'Ação criada',
        description: 'A ação foi adicionada aos rascunhos',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao criar ação',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useExecuteAction() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ actionId, confirm }: { actionId: string; confirm?: boolean }) => {
      const response = await supabase.functions.invoke('ad-action-execute', {
        body: { action_id: actionId, confirm },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ad-lifecycle-actions'] });
      queryClient.invalidateQueries({ queryKey: ['ad-timeline-stats'] });
      
      if (data.requires_confirmation) {
        toast({
          title: 'Confirmação necessária',
          description: 'Clique em executar novamente para confirmar',
        });
      } else if (data.success) {
        toast({
          title: 'Ação executada',
          description: data.result?.message || 'Concluído com sucesso',
        });
      } else {
        toast({
          title: 'Ação falhou',
          description: data.result?.error || 'Ocorreu um erro',
          variant: 'destructive',
        });
      }
    },
    onError: (error) => {
      toast({
        title: 'Erro na execução',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useCancelAction() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (actionId: string) => {
      const { error } = await supabase
        .from('ad_lifecycle_actions')
        .update({ action_status: 'CANCELLED' })
        .eq('id', actionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad-lifecycle-actions'] });
      toast({
        title: 'Ação cancelada',
      });
    },
  });
}

export function useFetchItemSnapshot() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ itemId, mlAccountId }: { itemId: string; mlAccountId: string }) => {
      const response = await supabase.functions.invoke('ad-item-snapshot', {
        body: { item_id: itemId, ml_account_id: mlAccountId },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onError: (error) => {
      toast({
        title: 'Erro ao buscar snapshot',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
