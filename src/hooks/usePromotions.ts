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
  discount_percent: number | null;
  error_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface UsePromotionsResult {
  promotions: PromotionSnapshot[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  
  // Computed views
  activePromotions: PromotionSnapshot[];
  endingSoonPromotions: PromotionSnapshot[];
  finishedPromotions: PromotionSnapshot[];
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPromotions = useCallback(async () => {
    // Both workspaceId and sellerId are required for security
    if (!workspaceId || !sellerId) {
      setPromotions([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Validate seller access via unified layer
      const hasAccess = await validateSellerAccess(sellerId);
      if (!hasAccess) {
        console.warn('[usePromotions] No access to seller:', sellerId);
        setPromotions([]);
        setLoading(false);
        return;
      }

      // Query with both workspace and seller_id filter (security)
      // Using seller_id column (TEXT) instead of account_id (UUID)
      const { data, error: fetchError } = await supabase
        .from('promotion_snapshots')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('seller_id', sellerId)
        .order('end_at', { ascending: true });

      if (fetchError) throw fetchError;

      setPromotions((data as unknown as PromotionSnapshot[]) || []);
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

  // Realtime subscription
  useEffect(() => {
    if (!workspaceId) return;

    const channel = supabase
      .channel(`promotions-${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'promotion_snapshots',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          fetchPromotions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId, fetchPromotions]);

  // Computed views
  const now = new Date();
  const hours48FromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const activePromotions = promotions.filter(p => p.status === 'started');
  
  const endingSoonPromotions = promotions.filter(p => {
    if (p.status !== 'started' || !p.end_at) return false;
    const endDate = new Date(p.end_at);
    return endDate <= hours48FromNow && endDate > now;
  });

  const finishedPromotions = promotions.filter(p => p.status === 'finished');

  return {
    promotions,
    loading,
    error,
    refetch: fetchPromotions,
    activePromotions,
    endingSoonPromotions,
    finishedPromotions,
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
