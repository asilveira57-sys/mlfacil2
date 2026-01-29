import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SellerCategory {
  category_id: string;
  category_name: string;
  category_path: string[];
  level1_category_id: string;
  level1_category_name: string;
  orders_count_90d: number;
  gmv_90d: number;
  is_pinned_auto: boolean;
  pinned_reason: string | null;
  visibility_mode: string;
  source: string;
}

export interface CategorySyncState {
  status: 'idle' | 'running' | 'completed' | 'failed';
  last_sync_at: string | null;
  categories_found: number;
  categories_pinned: number;
  error_message: string | null;
}

/**
 * Hook to fetch seller's dynamic categories based on their real sales activity
 */
export function useSellerCategories(accountId: string | null) {
  return useQuery({
    queryKey: ['seller-categories', accountId],
    queryFn: async (): Promise<SellerCategory[]> => {
      if (!accountId) return [];

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];

      // Use the RPC function to get visible categories with proper ordering
      const { data, error } = await supabase.rpc('get_seller_visible_categories', {
        p_user_id: session.user.id,
        p_account_id: accountId,
        p_limit: 12,
      });

      if (error) {
        console.error('[useSellerCategories] RPC error:', error);
        // Fallback to direct query
        const { data: fallbackData } = await supabase
          .from('account_category_activity')
          .select('*')
          .eq('account_id', accountId)
          .or('is_pinned_auto.eq.true,is_active.eq.true')
          .order('gmv_90d', { ascending: false })
          .limit(12);

        return (fallbackData || []).map(row => ({
          category_id: row.category_id,
          category_name: row.category_name || row.category_id,
          category_path: row.category_path || [],
          level1_category_id: row.level1_category_id || row.category_id,
          level1_category_name: row.level1_category_name || 'Categoria',
          orders_count_90d: row.orders_count_90d || 0,
          gmv_90d: Number(row.gmv_90d) || 0,
          is_pinned_auto: row.is_pinned_auto || false,
          pinned_reason: row.pinned_reason,
          visibility_mode: 'auto',
          source: row.is_pinned_auto ? 'auto_pinned' : 'active',
        }));
      }

      return (data || []).map((row: any) => ({
        category_id: row.category_id,
        category_name: row.category_name || row.category_id,
        category_path: row.category_path || [],
        level1_category_id: row.level1_category_id || row.category_id,
        level1_category_name: row.level1_category_name || 'Categoria',
        orders_count_90d: row.orders_count_90d || 0,
        gmv_90d: Number(row.gmv_90d) || 0,
        is_pinned_auto: row.is_pinned_auto || false,
        pinned_reason: row.pinned_reason,
        visibility_mode: row.visibility_mode || 'auto',
        source: row.source || 'active',
      }));
    },
    enabled: !!accountId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to get sync state for a seller's categories
 * NOTE: Polling disabled in static mode. Manual refresh or user-initiated sync only.
 */
export function useCategorySyncState(accountId: string | null) {
  return useQuery({
    queryKey: ['category-sync-state', accountId],
    queryFn: async (): Promise<CategorySyncState | null> => {
      if (!accountId) return null;

      const { data, error } = await supabase
        .from('account_category_sync_state')
        .select('status, last_sync_at, categories_found, categories_pinned, error_message')
        .eq('account_id', accountId)
        .maybeSingle();

      if (error || !data) {
        return {
          status: 'idle',
          last_sync_at: null,
          categories_found: 0,
          categories_pinned: 0,
          error_message: null,
        };
      }

      return {
        status: data.status as CategorySyncState['status'],
        last_sync_at: data.last_sync_at,
        categories_found: data.categories_found || 0,
        categories_pinned: data.categories_pinned || 0,
        error_message: data.error_message,
      };
    },
    enabled: !!accountId,
    staleTime: 30 * 1000, // 30 seconds
    // DISABLED: Static mode - no polling. User must click refresh or wait for sync to complete.
    // refetchInterval: (query) => {
    //   const data = query.state.data;
    //   if (data?.status === 'running') {
    //     return 3000;
    //   }
    //   return false;
    // },
  });
}

/**
 * Hook to trigger category sync for a seller
 */
export function useSyncCategories() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (accountId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('trends-sync-categories', {
        body: { account_id: accountId },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (_, accountId) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['seller-categories', accountId] });
      queryClient.invalidateQueries({ queryKey: ['category-sync-state', accountId] });
    },
  });
}

/**
 * Hook to update category visibility (force show/hide)
 */
export function useUpdateCategoryVisibility() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      accountId, 
      categoryId, 
      mode 
    }: { 
      accountId: string; 
      categoryId: string; 
      mode: 'auto' | 'force_show' | 'force_hide';
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('trends_category_visibility')
        .upsert({
          user_id: session.user.id,
          account_id: accountId,
          category_id: categoryId,
          mode,
        }, { onConflict: 'account_id,category_id' });

      if (error) throw error;
    },
    onSuccess: (_, { accountId }) => {
      queryClient.invalidateQueries({ queryKey: ['seller-categories', accountId] });
    },
  });
}

/**
 * Format GMV for display
 */
export function formatGmv(value: number): string {
  if (value >= 1000000) {
    return `R$ ${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `R$ ${(value / 1000).toFixed(1)}K`;
  }
  return `R$ ${value.toFixed(0)}`;
}
