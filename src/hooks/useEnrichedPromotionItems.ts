import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { validateSellerAccess } from '@/lib/accountUnification';
import type { PromotionItemSnapshot } from '@/hooks/usePromotions';

export interface ListingVisual {
  item_id: string;
  title: string | null;
  thumbnail: string | null;
  sku: string | null;
  permalink: string | null;
}

export interface EnrichedPromotionItem extends PromotionItemSnapshot {
  title: string | null;
  thumbnail: string | null;
  sku: string | null;
  permalink: string | null;
}

interface UseEnrichedPromotionItemsResult {
  items: EnrichedPromotionItem[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  pendingItems: EnrichedPromotionItem[];
  ineligibleItems: EnrichedPromotionItem[];
  startedItems: EnrichedPromotionItem[];
}

/**
 * Enriched version of usePromotionItems that joins with meli_listings_cache
 * to add thumbnail, title, sku, and permalink to each item.
 */
export function useEnrichedPromotionItems(
  workspaceId: string | null,
  promotionId?: string | null,
  sellerId?: string | null
): UseEnrichedPromotionItemsResult {
  const [rawItems, setRawItems] = useState<PromotionItemSnapshot[]>([]);
  const [visuals, setVisuals] = useState<Map<string, ListingVisual>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    if (!workspaceId || !sellerId) {
      setRawItems([]);
      setVisuals(new Map());
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const hasAccess = await validateSellerAccess(sellerId);
      if (!hasAccess) {
        console.warn('[useEnrichedPromotionItems] No access to seller:', sellerId);
        setRawItems([]);
        setLoading(false);
        return;
      }

      // 1. Fetch promotion items
      let query = supabase
        .from('promotion_items_snapshots')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('seller_id', sellerId)
        .order('item_status', { ascending: true });

      if (promotionId) {
        query = query.eq('promotion_id', promotionId);
      }

      const { data: itemsData, error: fetchError } = await query;
      if (fetchError) throw fetchError;

      const items = (itemsData as unknown as PromotionItemSnapshot[]) || [];
      setRawItems(items);

      // 2. Enrich with listing visuals (second query)
      if (items.length > 0) {
        const itemIds = [...new Set(items.map(i => i.item_id))];
        
        // Fetch in batches of 100 to avoid URL length limits
        const visualsMap = new Map<string, ListingVisual>();
        const batchSize = 100;
        
        for (let i = 0; i < itemIds.length; i += batchSize) {
          const batch = itemIds.slice(i, i + batchSize);
          const { data: listingsData } = await supabase
            .from('meli_listings_cache')
            .select('item_id, title, thumbnail, sku, permalink')
            .eq('seller_id', sellerId)
            .in('item_id', batch);

          if (listingsData) {
            for (const listing of listingsData) {
              // Only keep first match per item_id (may have multiple variations)
              if (!visualsMap.has(listing.item_id)) {
                visualsMap.set(listing.item_id, listing as ListingVisual);
              }
            }
          }
        }
        
        setVisuals(visualsMap);
      } else {
        setVisuals(new Map());
      }
    } catch (err) {
      console.error('[useEnrichedPromotionItems] Error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar itens');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, promotionId, sellerId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Merge raw items with visuals
  const enrichedItems = useMemo<EnrichedPromotionItem[]>(() => {
    return rawItems.map(item => {
      const visual = visuals.get(item.item_id);
      return {
        ...item,
        title: visual?.title || null,
        thumbnail: visual?.thumbnail || null,
        sku: visual?.sku || null,
        permalink: visual?.permalink || null,
      };
    });
  }, [rawItems, visuals]);

  // Computed views
  const pendingItems = useMemo(() => 
    enrichedItems.filter(i => i.item_status === 'candidate' || i.item_status === 'pending'),
    [enrichedItems]
  );

  const ineligibleItems = useMemo(() => 
    enrichedItems.filter(i => i.item_status === 'ineligible'),
    [enrichedItems]
  );

  const startedItems = useMemo(() => 
    enrichedItems.filter(i => i.item_status === 'started'),
    [enrichedItems]
  );

  return {
    items: enrichedItems,
    loading,
    error,
    refetch: fetchItems,
    pendingItems,
    ineligibleItems,
    startedItems,
  };
}

