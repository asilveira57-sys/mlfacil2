import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { validateSellerAccess } from '@/lib/accountUnification';

export interface PromotionSnapshot {
  id: string;
  workspace_id: string;
  seller_id: string;
  promotion_id: string;
  promotion_type: string;
  promotion_name: string | null;
  status: string;
  start_at: string | null;
  end_at: string | null;
  items_count?: number | null;
  created_at: string;
  updated_at: string;
}

export interface PromotionItemSnapshot {
  id: string;
  workspace_id: string;
  seller_id: string;
  promotion_id: string;
  item_id: string;
  item_status: string;
  original_price: number | null;
  promo_price: number | null;
  effective_price: number | null;
  net_proceeds_amount: number | null;
  net_proceeds_currency: string | null;
  suggested_price: number | null;
  max_discounted_price: number | null;
  min_discounted_price: number | null;
  discount_percent: number | null;
  error_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface PromotionItemCounts {
  participating: number;
  eligible: number;
  hasCoParticipation: boolean;
}

interface UsePromotionsResult {
  promotions: PromotionSnapshot[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  
  // Computed views
  activePromotions: PromotionSnapshot[];
  pendingPromotions: PromotionSnapshot[];
  endingSoonPromotions: PromotionSnapshot[];
  finishedPromotions: PromotionSnapshot[];
  
  // Item counts per promotion
  itemCounts: Record<string, PromotionItemCounts>;
}

interface UsePromotionItemsResult {
  items: PromotionItemSnapshot[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  
  // Computed views
  pendingItems: PromotionItemSnapshot[];
  ineligibleItems: PromotionItemSnapshot[];
  startedItems: PromotionItemSnapshot[];
}

/**
 * Hook for promotions - uses sellerId (from unified source) as required filter
 * to prevent data leakage between accounts.
 */
export function usePromotions(workspaceId: string | null, sellerId?: string | null): UsePromotionsResult {
  const [promotions, setPromotions] = useState<PromotionSnapshot[]>([]);
  const [itemCounts, setItemCounts] = useState<Record<string, PromotionItemCounts>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPromotions = useCallback(async () => {
    if (!workspaceId || !sellerId) {
      setPromotions([]);
      setItemCounts({});
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const hasAccess = await validateSellerAccess(sellerId);
      if (!hasAccess) {
        console.warn('[usePromotions] No access to seller:', sellerId);
        setPromotions([]);
        setLoading(false);
        return;
      }

      // Fetch promotions
      const promosResult = await supabase
        .from('promotion_snapshots')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('seller_id', sellerId)
        .order('end_at', { ascending: true });

      if (promosResult.error) throw promosResult.error;

      setPromotions((promosResult.data as unknown as PromotionSnapshot[]) || []);

      // Fetch item statuses with pagination to overcome 1000 row limit
      let allItemStatuses: { promotion_id: string; item_status: string; raw_item_data: unknown }[] = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data } = await supabase
          .from('promotion_items_snapshots')
          .select('promotion_id, item_status, raw_item_data')
          .eq('workspace_id', workspaceId)
          .eq('seller_id', sellerId)
          .range(from, from + pageSize - 1);

        if (data && data.length > 0) {
          allItemStatuses = allItemStatuses.concat(data);
          hasMore = data.length === pageSize;
          from += pageSize;
        } else {
          hasMore = false;
        }
      }

      // Build item counts map
      const counts: Record<string, PromotionItemCounts> = {};
      if (allItemStatuses.length > 0) {
        for (const row of allItemStatuses) {
          const pid = row.promotion_id;
          if (!counts[pid]) counts[pid] = { participating: 0, eligible: 0, hasCoParticipation: false };
          if (row.item_status === 'started') {
            counts[pid].participating++;
          } else if (row.item_status === 'candidate' || row.item_status === 'pending') {
            counts[pid].eligible++;
          }
          // Check for ML co-participation
          const rawData = row.raw_item_data as Record<string, unknown> | null;
          const meliPct = rawData?.meli_percentage as number | undefined;
          if (meliPct && meliPct > 0) {
            counts[pid].hasCoParticipation = true;
          }
        }
      }
      setItemCounts(counts);
    } catch (err) {
      console.error('[usePromotions] Error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar promoções');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, sellerId]);

  useEffect(() => {
    fetchPromotions();
  }, [fetchPromotions]);

  // DISABLED: Realtime subscription disabled in static mode
  // Data only updates on manual refresh or page reload
  // useEffect(() => {
  //   if (!workspaceId) return;
  //
  //   const channel = supabase
  //     .channel(`promotions-${workspaceId}`)
  //     .on(
  //       'postgres_changes',
  //       {
  //         event: '*',
  //         schema: 'public',
  //         table: 'promotion_snapshots',
  //         filter: `workspace_id=eq.${workspaceId}`,
  //       },
  //       () => {
  //         fetchPromotions();
  //       }
  //     )
  //     .subscribe();
  //
  //   return () => {
  //     supabase.removeChannel(channel);
  //   };
  // }, [workspaceId, fetchPromotions]);

  // Computed views
  const now = new Date();
  const hours72FromNow = new Date(now.getTime() + 72 * 60 * 60 * 1000);

  const activePromotions = promotions.filter(p => {
    if (p.status !== 'started') return false;
    if (p.end_at && new Date(p.end_at) <= now) return false; // Expirou
    return true;
  });
  const pendingPromotions = promotions.filter(p => p.status === 'pending');
  
  const endingSoonPromotions = promotions.filter(p => {
    if (p.status !== 'started' || !p.end_at) return false;
    const endDate = new Date(p.end_at);
    if (endDate <= now) return false; // Já expirou
    return endDate <= hours72FromNow;
  });

  const finishedPromotions = promotions.filter(p => {
    if (p.status === 'finished') return true;
    if (p.status === 'started' && p.end_at && new Date(p.end_at) <= now) return true;
    return false;
  });

  return {
    promotions,
    loading,
    error,
    refetch: fetchPromotions,
    activePromotions,
    pendingPromotions,
    endingSoonPromotions,
    finishedPromotions,
    itemCounts,
  };
}

/**
 * Hook for promotion items - uses sellerId (from unified source) as required filter.
 */
export function usePromotionItems(
  workspaceId: string | null,
  promotionId?: string | null,
  sellerId?: string | null
): UsePromotionItemsResult {
  const [items, setItems] = useState<PromotionItemSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    // Both workspaceId and sellerId are required for security
    if (!workspaceId || !sellerId) {
      setItems([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Using seller_id column (TEXT) instead of account_id (UUID)
      let query = supabase
        .from('promotion_items_snapshots')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('seller_id', sellerId)
        .order('item_status', { ascending: true });

      if (promotionId) {
        query = query.eq('promotion_id', promotionId);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setItems((data as unknown as PromotionItemSnapshot[]) || []);
    } catch (err) {
      console.error('[usePromotionItems] Error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar itens');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, promotionId, sellerId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Computed views
  const pendingItems = items.filter(i => 
    i.item_status === 'candidate' || i.item_status === 'pending'
  );

  const ineligibleItems = items.filter(i => i.item_status === 'ineligible');

  const startedItems = items.filter(i => i.item_status === 'started');

  return {
    items,
    loading,
    error,
    refetch: fetchItems,
    pendingItems,
    ineligibleItems,
    startedItems,
  };
}
