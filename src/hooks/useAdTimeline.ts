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
const PAGE_SIZE = 1000;

// Helper to resolve ml_user_id (numeric seller ID) to ml_accounts.id (UUID)
async function resolveMlAccountUuid(mlUserId: string | undefined): Promise<string | null> {
  if (!mlUserId) return null;
  
  const { data } = await supabase
    .from('ml_accounts')
    .select('id')
    .eq('ml_user_id', mlUserId)
    .maybeSingle();
  
  return data?.id || null;
}

export function useAdTimelineStats(workspaceId: string | null, filters: TimelineFilters) {
  return useQuery({
    queryKey: ['ad-timeline-stats', workspaceId, filters],
    queryFn: async () => {
      if (!workspaceId) return [];

      // Resolve ml_user_id (e.g. "66043362") to the actual UUID in ml_accounts
      const mlAccountUuid = await resolveMlAccountUuid(filters.ml_account_id);

      // Fetch all stats with pagination (no limit)
      let allStatsData: any[] = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from('ad_timeline_stats')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('days_since_last_sale', { ascending: false, nullsFirst: true });
        
        if (mlAccountUuid) {
          query = query.eq('ml_account_id', mlAccountUuid);
        }
        
        const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
        
        if (error) {
          console.error('[useAdTimelineStats] Error:', error);
          throw error;
        }
        
        allStatsData = allStatsData.concat(data || []);
        hasMore = (data?.length || 0) === PAGE_SIZE;
        offset += PAGE_SIZE;
      }

      // Enrich with listing data (also paginated)
      const itemIds = allStatsData.map(s => s.item_id);
      if (itemIds.length > 0) {
        // Fetch listings in batches to avoid query size limits
        const listingMap = new Map<string, any>();
        const batchSize = 500;
        for (let i = 0; i < itemIds.length; i += batchSize) {
          const batchIds = itemIds.slice(i, i + batchSize);
          const { data: listings } = await supabase
            .from('meli_listings_cache')
            .select('item_id, title, thumbnail, price, status, available_quantity, sku, variation_id')
            .in('item_id', batchIds);
          
          listings?.forEach(l => listingMap.set(l.item_id, l));
        }

        return allStatsData.map(stat => ({
          ...stat,
          ...listingMap.get(stat.item_id),
        })) as AdTimelineStats[];
      }

      return allStatsData as AdTimelineStats[];
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

      // Resolve ml_user_id to UUID
      const mlAccountUuid = await resolveMlAccountUuid(mlAccountId);

      let query = supabase
        .from('ad_timeline_stats')
        .select('status_bucket')
        .eq('workspace_id', workspaceId);

      if (mlAccountUuid) {
        query = query.eq('ml_account_id', mlAccountUuid);
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

      // Fetch all actions with pagination (no limit)
      let allActionsData: any[] = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from('ad_lifecycle_actions')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('updated_at', { ascending: false });
        
        if (statusFilter) {
          const statuses = statusFilter.split(',');
          query = query.in('action_status', statuses);
        }
        
        const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
        
        if (error) throw error;
        
        allActionsData = allActionsData.concat(data || []);
        hasMore = (data?.length || 0) === PAGE_SIZE;
        offset += PAGE_SIZE;
      }

      return allActionsData as AdLifecycleAction[];
    },
    enabled: !!workspaceId,
    // Static Mode: No auto-refresh on window focus
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
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

// Helper to resolve the active workspace ID for the current user
async function resolveActiveWorkspaceId(userId: string): Promise<string | null> {
  // 1) Try user_preferences.active_workspace_id
  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('active_workspace_id')
    .eq('user_id', userId)
    .maybeSingle();

  if ((prefs as any)?.active_workspace_id) {
    return (prefs as any).active_workspace_id as string;
  }

  // 2) Fallback: first workspace membership
  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  return (member as any)?.workspace_id as string | null;
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
      if (!user) throw new Error('Não autenticado');

      // ROBUST: Always resolve the correct workspace for the user
      // This prevents RLS errors when UI passes incorrect workspaceId (e.g., user.id)
      const resolvedWorkspaceId = await resolveActiveWorkspaceId(user.id);
      if (!resolvedWorkspaceId) {
        throw new Error('Workspace não encontrado. Verifique se você pertence a um workspace.');
      }

      // Resolver seller_id numérico para UUID
      const mlAccountUuid = await resolveMlAccountUuid(mlAccountId);
      if (!mlAccountUuid) {
        throw new Error('Conta do Mercado Livre não encontrada');
      }

      const { data, error } = await supabase
        .from('ad_lifecycle_actions')
        .insert([{
          workspace_id: resolvedWorkspaceId,
          ml_account_id: mlAccountUuid,
          item_id: itemId,
          action_type: actionType,
          action_status: 'DRAFT',
          reason: reason || `SEM_VENDA`,
          checklist: (checklist || {}) as Record<string, any>,
          created_by: user.id,
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
          description: data.result?.error || data.result?.message || 'Ocorreu um erro',
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
