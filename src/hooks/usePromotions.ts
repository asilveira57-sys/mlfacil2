import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PromotionSnapshot {
  id: string;
  workspace_id: string;
  account_id: string;
  promotion_id: string;
  promotion_type: string;
  promotion_name: string | null;
  status: string;
  start_at: string | null;
  end_at: string | null;
  items_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface PromotionItemSnapshot {
  id: string;
  workspace_id: string;
  account_id: string;
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

export function usePromotions(workspaceId: string | null, accountId?: string | null): UsePromotionsResult {
  const [promotions, setPromotions] = useState<PromotionSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPromotions = useCallback(async () => {
    if (!workspaceId) {
      setPromotions([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('promotion_snapshots')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('end_at', { ascending: true });

      if (accountId) {
        query = query.eq('account_id', accountId);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setPromotions((data as unknown as PromotionSnapshot[]) || []);
    } catch (err) {
      console.error('[usePromotions] Error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar promoções');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, accountId]);

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

export function usePromotionItems(
  workspaceId: string | null,
  promotionId?: string | null,
  accountId?: string | null
): UsePromotionItemsResult {
  const [items, setItems] = useState<PromotionItemSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    if (!workspaceId) {
      setItems([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('promotion_items_snapshots')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('item_status', { ascending: true });

      if (promotionId) {
        query = query.eq('promotion_id', promotionId);
      }

      if (accountId) {
        query = query.eq('account_id', accountId);
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
  }, [workspaceId, promotionId, accountId]);

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
